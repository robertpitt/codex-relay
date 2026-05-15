import { Context, Effect, Layer } from "effect";
import type { WorkError } from "../domain";
import { WorkEngine, type WorkRecoveryReport } from "../engine";

export type WorkRecoveryService = {
  readonly recoverProject: (projectPath: string) => Effect.Effect<WorkRecoveryReport, WorkError, any>;
  readonly recoverAll: () => Effect.Effect<WorkRecoveryReport[], WorkError, any>;
};

export const WorkRecovery = Context.Service<WorkRecoveryService>("relay/WorkRecovery");

export const WorkRecoveryLive = Layer.succeed(WorkRecovery)({
  recoverProject: (projectPath) => WorkEngine.use((engine) => engine.recoverProject(projectPath)),
  recoverAll: () => WorkEngine.use((engine) => engine.recoverAll())
});
