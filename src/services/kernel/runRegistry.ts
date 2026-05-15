import { Context, Effect, Layer, ManagedRuntime, Path, Queue, Ref } from "effect";
import type { StartRunInput } from "@shared/schemas";

type RegistryEffect<A> = Effect.Effect<A, unknown>;

export type KernelActiveRun = {
  readonly abortController: AbortController;
  readonly ticketId: string;
  readonly projectPath: string;
};

export type KernelQueuedRunIntent = {
  readonly input: StartRunInput;
  readonly resume: boolean;
  readonly dependencies: unknown;
};

export type KernelStartingRun = {
  readonly projectPath: string;
  readonly ticketId: string;
};

export type KernelTicketUpdateBeginResult =
  | { readonly started: true }
  | { readonly started: false; readonly existingRunId: string };

type ProjectSchedulerState = {
  readonly projectPath: string;
  readonly wakeQueue: Queue.Queue<void>;
  readonly loopStarted: boolean;
};

type RegistryState = {
  readonly activeImplementationRuns: Map<string, KernelActiveRun>;
  readonly activeDraftRuns: Map<string, KernelActiveRun>;
  readonly queuedRunIntents: Map<string, KernelQueuedRunIntent>;
  readonly startingRuns: Map<string, KernelStartingRun>;
  readonly projectSchedulers: Map<string, ProjectSchedulerState>;
  readonly activeTicketUpdateRuns: Map<string, KernelActiveRun>;
  readonly activeTicketUpdateRunsByTicket: Map<string, string>;
};

export type KernelRunRegistryService = {
  readonly activeRunIdForTicket: (projectPath: string, ticketId: string) => RegistryEffect<string | null>;
  readonly enqueueImplementation: (runId: string, intent: KernelQueuedRunIntent) => RegistryEffect<void>;
  readonly getQueuedImplementation: (runId: string) => RegistryEffect<KernelQueuedRunIntent | null>;
  readonly removeQueuedImplementation: (runId: string) => RegistryEffect<KernelQueuedRunIntent | null>;
  readonly markImplementationStarting: (runId: string, runRef: KernelStartingRun) => RegistryEffect<void>;
  readonly isImplementationActiveOrStarting: (runId: string) => RegistryEffect<boolean>;
  readonly getActiveImplementation: (runId: string) => RegistryEffect<KernelActiveRun | null>;
  readonly registerImplementationActive: (runId: string, activeRun: KernelActiveRun) => RegistryEffect<void>;
  readonly completeImplementation: (runId: string) => RegistryEffect<void>;
  readonly activeImplementationRunCount: (projectPath: string) => RegistryEffect<number>;
  readonly registerDraft: (runId: string, activeRun: KernelActiveRun) => RegistryEffect<void>;
  readonly getDraft: (runId: string) => RegistryEffect<KernelActiveRun | null>;
  readonly completeDraft: (runId: string) => RegistryEffect<void>;
  readonly beginTicketUpdate: (
    runId: string,
    ticketKey: string,
    activeRun: KernelActiveRun
  ) => RegistryEffect<KernelTicketUpdateBeginResult>;
  readonly getTicketUpdate: (runId: string) => RegistryEffect<KernelActiveRun | null>;
  readonly completeTicketUpdate: (runId: string) => RegistryEffect<void>;
  readonly claimProjectSchedulerLoop: (projectPath: string) => RegistryEffect<boolean>;
  readonly releaseProjectSchedulerLoop: (projectPath: string) => RegistryEffect<void>;
  readonly wakeProjectScheduler: (projectPath: string) => RegistryEffect<void>;
  readonly takeProjectSchedulerWake: (projectPath: string) => RegistryEffect<void>;
};

export const KernelRunRegistry = Context.Service<KernelRunRegistryService>("relay/KernelRunRegistry");

const emptyState = (): RegistryState => ({
  activeImplementationRuns: new Map(),
  activeDraftRuns: new Map(),
  queuedRunIntents: new Map(),
  startingRuns: new Map(),
  projectSchedulers: new Map(),
  activeTicketUpdateRuns: new Map(),
  activeTicketUpdateRunsByTicket: new Map()
});

const activeRunIdForTicketInMap = (
  runs: Map<string, KernelActiveRun>,
  projectPath: string,
  ticketId: string
): string | null => {
  for (const [runId, run] of runs) {
    if (run.projectPath === projectPath && run.ticketId === ticketId) return runId;
  }
  return null;
};

const getProjectSchedulerState = (
  stateRef: Ref.Ref<RegistryState>,
  path: Path.Path,
  projectPathInput: string
): RegistryEffect<ProjectSchedulerState> =>
  Effect.gen(function*() {
    const projectPath = path.resolve(projectPathInput);
    const current = yield* Ref.get(stateRef);
    const existing = current.projectSchedulers.get(projectPath);
    if (existing) return existing;

    const wakeQueue = yield* Queue.unbounded<void>();
    const created: ProjectSchedulerState = { projectPath, wakeQueue, loopStarted: false };
    return yield* Ref.modify(stateRef, (state) => {
      const existingScheduler = state.projectSchedulers.get(projectPath);
      if (existingScheduler) return [existingScheduler, state];
      const projectSchedulers = new Map(state.projectSchedulers);
      projectSchedulers.set(projectPath, created);
      return [created, { ...state, projectSchedulers }];
    });
  });

const makeKernelRunRegistry = Effect.gen(function*() {
  const stateRef = yield* Ref.make(emptyState());
  const path = yield* Path.Path;

  const activeRunIdForTicket: KernelRunRegistryService["activeRunIdForTicket"] = (projectPathInput, ticketId) =>
    Effect.map(Ref.get(stateRef), (state) => {
      const projectPath = path.resolve(projectPathInput);
      return (
        activeRunIdForTicketInMap(state.activeImplementationRuns, projectPath, ticketId) ??
        activeRunIdForTicketInMap(state.activeDraftRuns, projectPath, ticketId)
      );
    });

  const enqueueImplementation: KernelRunRegistryService["enqueueImplementation"] = (runId, intent) =>
    Ref.update(stateRef, (state) => {
      const queuedRunIntents = new Map(state.queuedRunIntents);
      queuedRunIntents.set(runId, intent);
      return { ...state, queuedRunIntents };
    });

  const getQueuedImplementation: KernelRunRegistryService["getQueuedImplementation"] = (runId) =>
    Effect.map(Ref.get(stateRef), (state) => state.queuedRunIntents.get(runId) ?? null);

  const removeQueuedImplementation: KernelRunRegistryService["removeQueuedImplementation"] = (runId) =>
    Ref.modify(stateRef, (state) => {
      const existing = state.queuedRunIntents.get(runId) ?? null;
      if (!existing) return [null, state];
      const queuedRunIntents = new Map(state.queuedRunIntents);
      queuedRunIntents.delete(runId);
      return [existing, { ...state, queuedRunIntents }];
    });

  const markImplementationStarting: KernelRunRegistryService["markImplementationStarting"] = (runId, runRef) =>
    Ref.update(stateRef, (state) => {
      const startingRuns = new Map(state.startingRuns);
      startingRuns.set(runId, { ...runRef, projectPath: path.resolve(runRef.projectPath) });
      return { ...state, startingRuns };
    });

  const isImplementationActiveOrStarting: KernelRunRegistryService["isImplementationActiveOrStarting"] = (runId) =>
    Effect.map(
      Ref.get(stateRef),
      (state) => state.activeImplementationRuns.has(runId) || state.startingRuns.has(runId)
    );

  const getActiveImplementation: KernelRunRegistryService["getActiveImplementation"] = (runId) =>
    Effect.map(Ref.get(stateRef), (state) => state.activeImplementationRuns.get(runId) ?? null);

  const registerImplementationActive: KernelRunRegistryService["registerImplementationActive"] = (runId, activeRun) =>
    Ref.update(stateRef, (state) => {
      const activeImplementationRuns = new Map(state.activeImplementationRuns);
      const startingRuns = new Map(state.startingRuns);
      const queuedRunIntents = new Map(state.queuedRunIntents);
      activeImplementationRuns.set(runId, { ...activeRun, projectPath: path.resolve(activeRun.projectPath) });
      startingRuns.delete(runId);
      queuedRunIntents.delete(runId);
      return { ...state, activeImplementationRuns, startingRuns, queuedRunIntents };
    });

  const completeImplementation: KernelRunRegistryService["completeImplementation"] = (runId) =>
    Ref.update(stateRef, (state) => {
      const activeImplementationRuns = new Map(state.activeImplementationRuns);
      const startingRuns = new Map(state.startingRuns);
      activeImplementationRuns.delete(runId);
      startingRuns.delete(runId);
      return { ...state, activeImplementationRuns, startingRuns };
    });

  const activeImplementationRunCount: KernelRunRegistryService["activeImplementationRunCount"] = (projectPathInput) =>
    Effect.map(Ref.get(stateRef), (state) => {
      const projectPath = path.resolve(projectPathInput);
      let count = 0;
      for (const run of state.activeImplementationRuns.values()) {
        if (run.projectPath === projectPath) count += 1;
      }
      for (const run of state.startingRuns.values()) {
        if (run.projectPath === projectPath) count += 1;
      }
      return count;
    });

  const registerDraft: KernelRunRegistryService["registerDraft"] = (runId, activeRun) =>
    Ref.update(stateRef, (state) => {
      const activeDraftRuns = new Map(state.activeDraftRuns);
      activeDraftRuns.set(runId, { ...activeRun, projectPath: path.resolve(activeRun.projectPath) });
      return { ...state, activeDraftRuns };
    });

  const getDraft: KernelRunRegistryService["getDraft"] = (runId) =>
    Effect.map(Ref.get(stateRef), (state) => state.activeDraftRuns.get(runId) ?? null);

  const completeDraft: KernelRunRegistryService["completeDraft"] = (runId) =>
    Ref.update(stateRef, (state) => {
      const activeDraftRuns = new Map(state.activeDraftRuns);
      activeDraftRuns.delete(runId);
      return { ...state, activeDraftRuns };
    });

  const beginTicketUpdate: KernelRunRegistryService["beginTicketUpdate"] = (runId, ticketKey, activeRun) =>
    Ref.modify(stateRef, (state): readonly [KernelTicketUpdateBeginResult, RegistryState] => {
      const existingRunId = state.activeTicketUpdateRunsByTicket.get(ticketKey);
      if (existingRunId) {
        const duplicate: KernelTicketUpdateBeginResult = { started: false, existingRunId };
        return [duplicate, state];
      }
      const activeTicketUpdateRuns = new Map(state.activeTicketUpdateRuns);
      const activeTicketUpdateRunsByTicket = new Map(state.activeTicketUpdateRunsByTicket);
      activeTicketUpdateRuns.set(runId, { ...activeRun, projectPath: path.resolve(activeRun.projectPath) });
      activeTicketUpdateRunsByTicket.set(ticketKey, runId);
      const started: KernelTicketUpdateBeginResult = { started: true };
      return [started, { ...state, activeTicketUpdateRuns, activeTicketUpdateRunsByTicket }];
    });

  const getTicketUpdate: KernelRunRegistryService["getTicketUpdate"] = (runId) =>
    Effect.map(Ref.get(stateRef), (state) => state.activeTicketUpdateRuns.get(runId) ?? null);

  const completeTicketUpdate: KernelRunRegistryService["completeTicketUpdate"] = (runId) =>
    Ref.update(stateRef, (state) => {
      const active = state.activeTicketUpdateRuns.get(runId);
      const activeTicketUpdateRuns = new Map(state.activeTicketUpdateRuns);
      const activeTicketUpdateRunsByTicket = new Map(state.activeTicketUpdateRunsByTicket);
      activeTicketUpdateRuns.delete(runId);
      if (active) {
        activeTicketUpdateRunsByTicket.delete(`${path.resolve(active.projectPath)}:${active.ticketId}`);
      } else {
        for (const [ticketKey, ticketRunId] of activeTicketUpdateRunsByTicket) {
          if (ticketRunId === runId) activeTicketUpdateRunsByTicket.delete(ticketKey);
        }
      }
      return { ...state, activeTicketUpdateRuns, activeTicketUpdateRunsByTicket };
    });

  const claimProjectSchedulerLoop: KernelRunRegistryService["claimProjectSchedulerLoop"] = (projectPathInput) =>
    Effect.gen(function*() {
      const scheduler = yield* getProjectSchedulerState(stateRef, path, projectPathInput);
      return yield* Ref.modify(stateRef, (state) => {
        const current = state.projectSchedulers.get(scheduler.projectPath);
        if (!current || current.loopStarted) return [false, state];
        const projectSchedulers = new Map(state.projectSchedulers);
        projectSchedulers.set(scheduler.projectPath, { ...current, loopStarted: true });
        return [true, { ...state, projectSchedulers }];
      });
    });

  const releaseProjectSchedulerLoop: KernelRunRegistryService["releaseProjectSchedulerLoop"] = (projectPathInput) =>
    Effect.gen(function*() {
      const projectPath = path.resolve(projectPathInput);
      yield* Ref.update(stateRef, (state) => {
        const current = state.projectSchedulers.get(projectPath);
        if (!current || !current.loopStarted) return state;
        const projectSchedulers = new Map(state.projectSchedulers);
        projectSchedulers.set(projectPath, { ...current, loopStarted: false });
        return { ...state, projectSchedulers };
      });
    });

  const wakeProjectScheduler: KernelRunRegistryService["wakeProjectScheduler"] = (projectPath) =>
    Effect.gen(function*() {
      const scheduler = yield* getProjectSchedulerState(stateRef, path, projectPath);
      yield* Queue.offer(scheduler.wakeQueue, undefined);
    });

  const takeProjectSchedulerWake: KernelRunRegistryService["takeProjectSchedulerWake"] = (projectPath) =>
    Effect.gen(function*() {
      const scheduler = yield* getProjectSchedulerState(stateRef, path, projectPath);
      yield* Queue.take(scheduler.wakeQueue);
    });

  return {
    activeRunIdForTicket,
    enqueueImplementation,
    getQueuedImplementation,
    removeQueuedImplementation,
    markImplementationStarting,
    isImplementationActiveOrStarting,
    getActiveImplementation,
    registerImplementationActive,
    completeImplementation,
    activeImplementationRunCount,
    registerDraft,
    getDraft,
    completeDraft,
    beginTicketUpdate,
    getTicketUpdate,
    completeTicketUpdate,
    claimProjectSchedulerLoop,
    releaseProjectSchedulerLoop,
    wakeProjectScheduler,
    takeProjectSchedulerWake
  } satisfies KernelRunRegistryService;
});

export const KernelRunRegistryLive = Layer.effect(KernelRunRegistry, makeKernelRunRegistry);

const fallbackRegistryRuntime = ManagedRuntime.make(KernelRunRegistryLive.pipe(Layer.provide(Path.layer)));

export const runKernelRunRegistryEffect = async <A>(
  effect: Effect.Effect<A, unknown, Context.Service.Identifier<typeof KernelRunRegistry>>
): Promise<A> => fallbackRegistryRuntime.runPromise(effect);
