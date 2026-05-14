import { Context, Effect, Exit, Fiber, Layer, Option, Scope } from "effect";
import { Workflow, WorkflowEngine } from "effect/unstable/workflow";
import type { BackendIoServices, BackendServicesBase } from "../../runtime";
import { JobLedger, type JobLedgerService } from "./ledger";
import type { JobExecutionSnapshot } from "./types";
import { isTerminalJobStatus } from "./types";
import { RelayExternalJobWorkflow, type ExternalJobWorkflowPayload } from "./workflows";

export type KernelRuntimeServices = BackendServicesBase | BackendIoServices;
type EncodedWorkflowExecute = Parameters<WorkflowEngine.Encoded["register"]>[1];

type WorkflowRegistration = {
  readonly workflow: Workflow.Any;
  readonly execute: EncodedWorkflowExecute;
  readonly scope: Scope.Scope;
};

type ExecutionState = {
  readonly payload: object;
  readonly execute: WorkflowRegistration["execute"];
  readonly parent: string | undefined;
  instance: WorkflowEngine.WorkflowInstance["Service"];
  fiber: Fiber.Fiber<Workflow.Result<unknown, unknown>, unknown> | undefined;
};

const externalJobPayload = (payload: object): ExternalJobWorkflowPayload => payload as ExternalJobWorkflowPayload;

const waitForExternalJob = (
  ledger: JobLedgerService,
  payload: ExternalJobWorkflowPayload,
  executionId: string
): Effect.Effect<unknown, unknown, KernelRuntimeServices | WorkflowEngine.WorkflowInstance> =>
  Effect.gen(function*() {
    const instance = yield* WorkflowEngine.WorkflowInstance;
    while (true) {
      const snapshot = yield* ledger.readSnapshot(payload.projectPath, executionId);
      if (!snapshot) {
        return yield* Effect.fail(new Error(`Kernel job disappeared during execution: ${executionId}`));
      }
      switch (snapshot.status) {
        case "completed":
          return snapshot.result;
        case "failed":
          return yield* Effect.fail(snapshot.error ?? snapshot.message ?? new Error(`Kernel job failed: ${executionId}`));
        case "cancelled":
          return yield* Effect.interrupt;
        case "suspended":
          return yield* Workflow.suspend(instance);
        case "submitted":
        case "queued":
        case "running":
          yield* Effect.sleep("100 millis");
          break;
      }
    }
  });

const resultFromSnapshot = (snapshot: JobExecutionSnapshot): Workflow.Result<unknown, unknown> | null => {
  switch (snapshot.status) {
    case "completed":
      return new Workflow.Complete({ exit: Exit.succeed(snapshot.result) });
    case "failed":
      return new Workflow.Complete({ exit: Exit.fail(snapshot.error ?? snapshot.message) });
    case "cancelled":
      return new Workflow.Complete({ exit: Exit.fail(snapshot.message ?? "cancelled") });
    case "suspended":
      return new Workflow.Suspended({});
    case "submitted":
    case "queued":
    case "running":
      return null;
  }
};

const markResult = (
  ledger: JobLedgerService,
  payload: object,
  executionId: string,
  result: Workflow.Result<unknown, unknown>
): Effect.Effect<void, unknown, KernelRuntimeServices> => {
  const jobPayload = externalJobPayload(payload);
  if (result._tag === "Suspended") {
    return Effect.asVoid(
      ledger.transition({
        projectPath: jobPayload.projectPath,
        executionId,
        status: "suspended",
        message: "Workflow suspended awaiting external input."
      })
    );
  }
  if (Exit.isSuccess(result.exit)) {
    return Effect.asVoid(
      ledger.transition({
        projectPath: jobPayload.projectPath,
        executionId,
        status: "completed",
        result: result.exit.value
      })
    );
  }
  return Effect.asVoid(
    ledger.transition({
      projectPath: jobPayload.projectPath,
      executionId,
      status: "failed",
      error: result.exit.cause,
      message: "Workflow failed."
    })
  );
};

const makeDurableEngine = (
  ledger: JobLedgerService,
  runtimeContext: Context.Context<KernelRuntimeServices>
): WorkflowEngine.WorkflowEngine["Service"] => {
  const workflows = new Map<string, WorkflowRegistration>();
  const executions = new Map<string, ExecutionState>();

  let engine!: WorkflowEngine.WorkflowEngine["Service"];

  const provideRuntime = <A, E>(
    effect: Effect.Effect<A, E, KernelRuntimeServices>
  ): Effect.Effect<A, E> => Effect.provide(effect, runtimeContext);

  const provideRuntimeOrDie = <A, E>(
    effect: Effect.Effect<A, E, KernelRuntimeServices>
  ): Effect.Effect<A> => provideRuntime(effect).pipe(Effect.catch((cause: E) => Effect.die(cause)));

  const resume: (executionId: string) => Effect.Effect<void> = Effect.fnUntraced(function*(executionId: string) {
    const state = executions.get(executionId);
    if (!state) return;
    const exit = state.fiber?.pollUnsafe();
    if (exit && exit._tag === "Success" && exit.value._tag === "Complete") return;
    if (state.fiber && !exit) return;

    const entry = workflows.get(state.instance.workflow.name);
    if (!entry) return;

    const payload = externalJobPayload(state.payload);
    const snapshot = yield* provideRuntimeOrDie(ledger.readSnapshot(payload.projectPath, executionId));
    if (snapshot && isTerminalJobStatus(snapshot.status)) return;

    const instance = WorkflowEngine.WorkflowInstance.initial(state.instance.workflow, state.instance.executionId);
    instance.interrupted = state.instance.interrupted;
    state.instance = instance;

    if (!snapshot || snapshot.status === "submitted") {
      yield* provideRuntimeOrDie(ledger.transition({
        projectPath: payload.projectPath,
        executionId,
        status: "running",
        message: "Workflow execution started."
      }));
    }

    state.fiber = yield* state.execute(state.payload, state.instance.executionId).pipe(
      Workflow.intoResult,
      Effect.provideService(WorkflowEngine.WorkflowInstance, instance),
      Effect.provideService(WorkflowEngine.WorkflowEngine, engine),
      Effect.tap((result) => provideRuntimeOrDie(markResult(ledger, state.payload, state.instance.executionId, result))),
      Effect.tap((result) => {
        if (!state.parent || result._tag !== "Complete") return Effect.void;
        return Effect.forkIn(resume(state.parent), entry.scope);
      }),
      Effect.forkIn(entry.scope)
    );
  });

  const encoded: WorkflowEngine.Encoded = {
    register: Effect.fnUntraced(function*(workflow, execute) {
      workflows.set(workflow.name, {
        workflow,
        execute,
        scope: yield* Effect.scope
      });
    }),
    execute: Effect.fnUntraced(function*<const Discard extends boolean>(
      workflow: Workflow.Any,
      options: {
        readonly executionId: string;
        readonly payload: object;
        readonly discard: Discard;
        readonly parent?: WorkflowEngine.WorkflowInstance["Service"] | undefined;
      }
    ) {
      const entry = workflows.get(workflow.name);
      if (!entry) {
        return yield* Effect.die(`Workflow ${workflow.name} is not registered`);
      }

      const payload = externalJobPayload(options.payload);
      let state = executions.get(options.executionId);
      const snapshot = yield* provideRuntimeOrDie(ledger.readSnapshot(payload.projectPath, options.executionId));
      if (snapshot && isTerminalJobStatus(snapshot.status)) {
        const result = resultFromSnapshot(snapshot);
        if (options.discard) return undefined as Discard extends true ? void : Workflow.Result<unknown, unknown>;
        if (result) return result as Discard extends true ? void : Workflow.Result<unknown, unknown>;
      }

      if (!state) {
        state = {
          payload: options.payload,
          execute: entry.execute,
          instance: WorkflowEngine.WorkflowInstance.initial(workflow, options.executionId),
          fiber: undefined,
          parent: options.parent?.executionId
        };
        executions.set(options.executionId, state);
      }

      yield* resume(options.executionId);
      if (options.discard) return undefined as Discard extends true ? void : Workflow.Result<unknown, unknown>;
      const result = yield* Fiber.join(state.fiber!).pipe(Effect.catch((cause: unknown) => Effect.die(cause)));
      return result as Discard extends true ? void : Workflow.Result<unknown, unknown>;
    }),
    poll: (_workflow: Workflow.Any, executionId: string) =>
      Effect.gen(function*() {
        const state = executions.get(executionId);
        if (state) {
          const exit = state.fiber?.pollUnsafe();
          if (!exit) return Option.none<Workflow.Result<unknown, unknown>>();
          return exit._tag === "Success" ? Option.some(exit.value) : yield* Effect.die(exit.cause);
        }

        for (const registration of workflows.values()) {
          void registration;
        }
        return Option.none<Workflow.Result<unknown, unknown>>();
      }),
    interrupt: Effect.fnUntraced(function*(_workflow: Workflow.Any, executionId: string) {
      const state = executions.get(executionId);
      if (!state) return;
      state.instance.interrupted = true;
      const payload = externalJobPayload(state.payload);
      yield* provideRuntimeOrDie(ledger.transition({
        projectPath: payload.projectPath,
        executionId,
        status: "cancelled",
        message: "Workflow interrupted."
      }));
      if (state.fiber) {
        yield* Fiber.interrupt(state.fiber);
      }
    }),
    interruptUnsafe: Effect.fnUntraced(function*(_workflow: Workflow.Any, executionId: string) {
      const state = executions.get(executionId);
      if (!state) return;
      state.instance.interrupted = true;
      if (state.fiber) {
        yield* Fiber.interrupt(state.fiber);
      }
    }),
    resume(_workflow: Workflow.Any, executionId: string) {
      return resume(executionId);
    },
    activityExecute: Effect.fnUntraced(function*() {
      return yield* Effect.die("RelayWorkflowEngine does not support durable activities yet.");
    }),
    deferredResult: () => Effect.succeedNone,
    deferredDone: () => Effect.void,
    scheduleClock: () => Effect.void
  };

  engine = WorkflowEngine.makeUnsafe(encoded);

  return engine;
};

export const RelayWorkflowEngineLive = Layer.effect(
  WorkflowEngine.WorkflowEngine,
  Effect.gen(function*() {
    const ledger = yield* JobLedger;
    const runtimeContext = yield* Effect.context<KernelRuntimeServices>();
    const engine = makeDurableEngine(ledger, runtimeContext);
    yield* engine.register(RelayExternalJobWorkflow, (payload, executionId) =>
      waitForExternalJob(ledger, payload as ExternalJobWorkflowPayload, executionId)
        .pipe(Effect.provide(runtimeContext))
    ).pipe(Effect.provideService(WorkflowEngine.WorkflowEngine, engine));
    return engine;
  })
);
