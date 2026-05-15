import { Context, Layer } from "effect";
import { WorkflowEngine } from "effect/unstable/workflow";

export type WorkRuntimeService = {
  readonly workflowBoundary: "work-runtime";
};

export const WorkRuntime = Context.Service<WorkRuntimeService>("relay/WorkRuntime");

export type WorkRuntimeWorkflowServices = Context.Service.Identifier<typeof WorkflowEngine.WorkflowEngine>;

export const WorkRuntimeLive = Layer.succeed(WorkRuntime)({
  workflowBoundary: "work-runtime"
});
