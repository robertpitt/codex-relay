import { Context, Effect, Layer, ManagedRuntime, Path, Queue, Ref } from "effect";
import type { StartRunInput } from "@shared/schemas";

type SchedulerEffect<A> = Effect.Effect<A>;

export type WorkActiveRun = {
  readonly abortController: AbortController;
  readonly ticketId: string;
  readonly projectPath: string;
  readonly workId?: string;
  readonly attemptId?: string;
  readonly leaseToken?: string;
};

export type WorkQueuedImplementationIntent = {
  readonly input: StartRunInput;
  readonly resume: boolean;
  readonly dependencies: unknown;
};

export type WorkStartingRun = {
  readonly projectPath: string;
  readonly ticketId: string;
  readonly attemptId?: string;
  readonly leaseToken?: string;
};

export type WorkTicketUpdateBeginResult =
  | { readonly started: true }
  | { readonly started: false; readonly existingRunId: string };

type ProjectSchedulerState = {
  readonly projectPath: string;
  readonly wakeQueue: Queue.Queue<void>;
  readonly loopStarted: boolean;
};

type SchedulerState = {
  readonly activeImplementationRuns: Map<string, WorkActiveRun>;
  readonly activeDraftRuns: Map<string, WorkActiveRun>;
  readonly queuedImplementationIntents: Map<string, WorkQueuedImplementationIntent>;
  readonly startingRuns: Map<string, WorkStartingRun>;
  readonly projectSchedulers: Map<string, ProjectSchedulerState>;
  readonly activeTicketUpdateRuns: Map<string, WorkActiveRun>;
  readonly activeTicketUpdateRunsByTicket: Map<string, string>;
};

export type WorkSchedulerService = {
  readonly activeRunIdForTicket: (projectPath: string, ticketId: string) => SchedulerEffect<string | null>;
  readonly enqueueImplementation: (workId: string, intent: WorkQueuedImplementationIntent) => SchedulerEffect<void>;
  readonly getQueuedImplementation: (workId: string) => SchedulerEffect<WorkQueuedImplementationIntent | null>;
  readonly removeQueuedImplementation: (workId: string) => SchedulerEffect<WorkQueuedImplementationIntent | null>;
  readonly firstQueuedImplementation: (
    projectPath: string,
    preferredWorkId?: string | null
  ) => SchedulerEffect<readonly [workId: string, intent: WorkQueuedImplementationIntent] | null>;
  readonly markImplementationStarting: (workId: string, runRef: WorkStartingRun) => SchedulerEffect<void>;
  readonly getStartingImplementation: (workId: string) => SchedulerEffect<WorkStartingRun | null>;
  readonly isImplementationActiveOrStarting: (workId: string) => SchedulerEffect<boolean>;
  readonly getActiveImplementation: (workId: string) => SchedulerEffect<WorkActiveRun | null>;
  readonly registerImplementationActive: (workId: string, activeRun: WorkActiveRun) => SchedulerEffect<void>;
  readonly completeImplementation: (workId: string) => SchedulerEffect<void>;
  readonly activeImplementationRunCount: (projectPath: string) => SchedulerEffect<number>;
  readonly registerDraft: (workId: string, activeRun: WorkActiveRun) => SchedulerEffect<void>;
  readonly getDraft: (workId: string) => SchedulerEffect<WorkActiveRun | null>;
  readonly completeDraft: (workId: string) => SchedulerEffect<void>;
  readonly beginTicketUpdate: (
    workId: string,
    ticketKey: string,
    activeRun: WorkActiveRun
  ) => SchedulerEffect<WorkTicketUpdateBeginResult>;
  readonly updateTicketUpdateAttempt: (
    workId: string,
    attempt: Pick<WorkActiveRun, "attemptId" | "leaseToken">
  ) => SchedulerEffect<void>;
  readonly getTicketUpdate: (workId: string) => SchedulerEffect<WorkActiveRun | null>;
  readonly completeTicketUpdate: (workId: string) => SchedulerEffect<void>;
  readonly claimProjectSchedulerLoop: (projectPath: string) => SchedulerEffect<boolean>;
  readonly releaseProjectSchedulerLoop: (projectPath: string) => SchedulerEffect<void>;
  readonly wakeProjectScheduler: (projectPath: string) => SchedulerEffect<void>;
  readonly takeProjectSchedulerWake: (projectPath: string) => SchedulerEffect<void>;
};

export const WorkScheduler = Context.Service<WorkSchedulerService>("relay/WorkScheduler");

const emptyState = (): SchedulerState => ({
  activeImplementationRuns: new Map(),
  activeDraftRuns: new Map(),
  queuedImplementationIntents: new Map(),
  startingRuns: new Map(),
  projectSchedulers: new Map(),
  activeTicketUpdateRuns: new Map(),
  activeTicketUpdateRunsByTicket: new Map()
});

const sharedSchedulerState = Ref.makeUnsafe(emptyState());

const activeRunIdForTicketInMap = (
  runs: Map<string, WorkActiveRun>,
  projectPath: string,
  ticketId: string
): string | null => {
  for (const [workId, run] of runs) {
    if (run.projectPath === projectPath && run.ticketId === ticketId) return workId;
  }
  return null;
};

const getProjectSchedulerState = (
  stateRef: Ref.Ref<SchedulerState>,
  path: Path.Path,
  projectPathInput: string
): SchedulerEffect<ProjectSchedulerState> =>
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

const makeWorkScheduler = Effect.gen(function*() {
  const stateRef = sharedSchedulerState;
  const path = yield* Path.Path;

  const activeRunIdForTicket: WorkSchedulerService["activeRunIdForTicket"] = (projectPathInput, ticketId) =>
    Effect.map(Ref.get(stateRef), (state) => {
      const projectPath = path.resolve(projectPathInput);
      return (
        activeRunIdForTicketInMap(state.activeImplementationRuns, projectPath, ticketId) ??
        activeRunIdForTicketInMap(state.activeDraftRuns, projectPath, ticketId) ??
        activeRunIdForTicketInMap(state.activeTicketUpdateRuns, projectPath, ticketId)
      );
    });

  const enqueueImplementation: WorkSchedulerService["enqueueImplementation"] = (workId, intent) =>
    Ref.update(stateRef, (state) => {
      const queuedImplementationIntents = new Map(state.queuedImplementationIntents);
      queuedImplementationIntents.set(workId, {
        ...intent,
        input: { ...intent.input, projectPath: path.resolve(intent.input.projectPath) }
      });
      return { ...state, queuedImplementationIntents };
    });

  const getQueuedImplementation: WorkSchedulerService["getQueuedImplementation"] = (workId) =>
    Effect.map(Ref.get(stateRef), (state) => state.queuedImplementationIntents.get(workId) ?? null);

  const removeQueuedImplementation: WorkSchedulerService["removeQueuedImplementation"] = (workId) =>
    Ref.modify(stateRef, (state) => {
      const existing = state.queuedImplementationIntents.get(workId) ?? null;
      if (!existing) return [null, state];
      const queuedImplementationIntents = new Map(state.queuedImplementationIntents);
      queuedImplementationIntents.delete(workId);
      return [existing, { ...state, queuedImplementationIntents }];
    });

  const firstQueuedImplementation: WorkSchedulerService["firstQueuedImplementation"] = (projectPathInput, preferredWorkId) =>
    Effect.map(Ref.get(stateRef), (state) => {
      const projectPath = path.resolve(projectPathInput);
      if (preferredWorkId) {
        const preferred = state.queuedImplementationIntents.get(preferredWorkId);
        if (preferred && path.resolve(preferred.input.projectPath) === projectPath) return [preferredWorkId, preferred] as const;
      }
      for (const entry of state.queuedImplementationIntents) {
        if (path.resolve(entry[1].input.projectPath) === projectPath) return entry;
      }
      return null;
    });

  const markImplementationStarting: WorkSchedulerService["markImplementationStarting"] = (workId, runRef) =>
    Ref.update(stateRef, (state) => {
      const startingRuns = new Map(state.startingRuns);
      startingRuns.set(workId, { ...runRef, projectPath: path.resolve(runRef.projectPath) });
      return { ...state, startingRuns };
    });

  const getStartingImplementation: WorkSchedulerService["getStartingImplementation"] = (workId) =>
    Effect.map(Ref.get(stateRef), (state) => state.startingRuns.get(workId) ?? null);

  const isImplementationActiveOrStarting: WorkSchedulerService["isImplementationActiveOrStarting"] = (workId) =>
    Effect.map(
      Ref.get(stateRef),
      (state) => state.activeImplementationRuns.has(workId) || state.startingRuns.has(workId)
    );

  const getActiveImplementation: WorkSchedulerService["getActiveImplementation"] = (workId) =>
    Effect.map(Ref.get(stateRef), (state) => state.activeImplementationRuns.get(workId) ?? null);

  const registerImplementationActive: WorkSchedulerService["registerImplementationActive"] = (workId, activeRun) =>
    Ref.update(stateRef, (state) => {
      const activeImplementationRuns = new Map(state.activeImplementationRuns);
      const startingRuns = new Map(state.startingRuns);
      const queuedImplementationIntents = new Map(state.queuedImplementationIntents);
      const starting = startingRuns.get(workId);
      activeImplementationRuns.set(workId, {
        ...activeRun,
        projectPath: path.resolve(activeRun.projectPath),
        workId,
        attemptId: activeRun.attemptId ?? starting?.attemptId,
        leaseToken: activeRun.leaseToken ?? starting?.leaseToken
      });
      startingRuns.delete(workId);
      queuedImplementationIntents.delete(workId);
      return { ...state, activeImplementationRuns, startingRuns, queuedImplementationIntents };
    });

  const completeImplementation: WorkSchedulerService["completeImplementation"] = (workId) =>
    Ref.update(stateRef, (state) => {
      const activeImplementationRuns = new Map(state.activeImplementationRuns);
      const startingRuns = new Map(state.startingRuns);
      activeImplementationRuns.delete(workId);
      startingRuns.delete(workId);
      return { ...state, activeImplementationRuns, startingRuns };
    });

  const activeImplementationRunCount: WorkSchedulerService["activeImplementationRunCount"] = (projectPathInput) =>
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

  const registerDraft: WorkSchedulerService["registerDraft"] = (workId, activeRun) =>
    Ref.update(stateRef, (state) => {
      const activeDraftRuns = new Map(state.activeDraftRuns);
      activeDraftRuns.set(workId, { ...activeRun, projectPath: path.resolve(activeRun.projectPath), workId });
      return { ...state, activeDraftRuns };
    });

  const getDraft: WorkSchedulerService["getDraft"] = (workId) =>
    Effect.map(Ref.get(stateRef), (state) => state.activeDraftRuns.get(workId) ?? null);

  const completeDraft: WorkSchedulerService["completeDraft"] = (workId) =>
    Ref.update(stateRef, (state) => {
      const activeDraftRuns = new Map(state.activeDraftRuns);
      activeDraftRuns.delete(workId);
      return { ...state, activeDraftRuns };
    });

  const beginTicketUpdate: WorkSchedulerService["beginTicketUpdate"] = (workId, ticketKey, activeRun) =>
    Ref.modify(stateRef, (state): readonly [WorkTicketUpdateBeginResult, SchedulerState] => {
      const existingRunId = state.activeTicketUpdateRunsByTicket.get(ticketKey);
      if (existingRunId) return [{ started: false, existingRunId }, state];
      const activeTicketUpdateRuns = new Map(state.activeTicketUpdateRuns);
      const activeTicketUpdateRunsByTicket = new Map(state.activeTicketUpdateRunsByTicket);
      activeTicketUpdateRuns.set(workId, { ...activeRun, projectPath: path.resolve(activeRun.projectPath), workId });
      activeTicketUpdateRunsByTicket.set(ticketKey, workId);
      return [{ started: true }, { ...state, activeTicketUpdateRuns, activeTicketUpdateRunsByTicket }];
    });

  const updateTicketUpdateAttempt: WorkSchedulerService["updateTicketUpdateAttempt"] = (workId, attempt) =>
    Ref.update(stateRef, (state) => {
      const active = state.activeTicketUpdateRuns.get(workId);
      if (!active) return state;
      const activeTicketUpdateRuns = new Map(state.activeTicketUpdateRuns);
      activeTicketUpdateRuns.set(workId, {
        ...active,
        attemptId: attempt.attemptId ?? active.attemptId,
        leaseToken: attempt.leaseToken ?? active.leaseToken
      });
      return { ...state, activeTicketUpdateRuns };
    });

  const getTicketUpdate: WorkSchedulerService["getTicketUpdate"] = (workId) =>
    Effect.map(Ref.get(stateRef), (state) => state.activeTicketUpdateRuns.get(workId) ?? null);

  const completeTicketUpdate: WorkSchedulerService["completeTicketUpdate"] = (workId) =>
    Ref.update(stateRef, (state) => {
      const active = state.activeTicketUpdateRuns.get(workId);
      const activeTicketUpdateRuns = new Map(state.activeTicketUpdateRuns);
      const activeTicketUpdateRunsByTicket = new Map(state.activeTicketUpdateRunsByTicket);
      activeTicketUpdateRuns.delete(workId);
      if (active) {
        activeTicketUpdateRunsByTicket.delete(`${path.resolve(active.projectPath)}:${active.ticketId}`);
      } else {
        for (const [ticketKey, ticketRunId] of activeTicketUpdateRunsByTicket) {
          if (ticketRunId === workId) activeTicketUpdateRunsByTicket.delete(ticketKey);
        }
      }
      return { ...state, activeTicketUpdateRuns, activeTicketUpdateRunsByTicket };
    });

  const claimProjectSchedulerLoop: WorkSchedulerService["claimProjectSchedulerLoop"] = (projectPathInput) =>
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

  const releaseProjectSchedulerLoop: WorkSchedulerService["releaseProjectSchedulerLoop"] = (projectPathInput) =>
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

  const wakeProjectScheduler: WorkSchedulerService["wakeProjectScheduler"] = (projectPathInput) =>
    Effect.gen(function*() {
      const scheduler = yield* getProjectSchedulerState(stateRef, path, projectPathInput);
      yield* Queue.offer(scheduler.wakeQueue, undefined);
    });

  const takeProjectSchedulerWake: WorkSchedulerService["takeProjectSchedulerWake"] = (projectPathInput) =>
    Effect.gen(function*() {
      const scheduler = yield* getProjectSchedulerState(stateRef, path, projectPathInput);
      yield* Queue.take(scheduler.wakeQueue);
    });

  return {
    activeRunIdForTicket,
    enqueueImplementation,
    getQueuedImplementation,
    removeQueuedImplementation,
    firstQueuedImplementation,
    markImplementationStarting,
    getStartingImplementation,
    isImplementationActiveOrStarting,
    getActiveImplementation,
    registerImplementationActive,
    completeImplementation,
    activeImplementationRunCount,
    registerDraft,
    getDraft,
    completeDraft,
    beginTicketUpdate,
    updateTicketUpdateAttempt,
    getTicketUpdate,
    completeTicketUpdate,
    claimProjectSchedulerLoop,
    releaseProjectSchedulerLoop,
    wakeProjectScheduler,
    takeProjectSchedulerWake
  } satisfies WorkSchedulerService;
});

export const WorkSchedulerLive = Layer.effect(WorkScheduler, makeWorkScheduler);

const sharedSchedulerRuntime = ManagedRuntime.make(WorkSchedulerLive.pipe(Layer.provide(Path.layer)));

export const runWorkSchedulerEffect = async <A>(
  effect: Effect.Effect<A, unknown, Context.Service.Identifier<typeof WorkScheduler>>
): Promise<A> => sharedSchedulerRuntime.runPromise(effect);
