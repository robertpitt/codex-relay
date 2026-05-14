import { RpcGroup } from "effect/unstable/rpc";
import { BoardRead } from "./board";
import {
  CodexApproveAction,
  CodexCancelRun,
  CodexPreflightRun,
  CodexReadLatestRunSummary,
  CodexReadRunEvents,
  CodexResumeRun,
  CodexSendRepositoryChatMessage,
  CodexStartRun,
  CodexStatus
} from "./codex";
import {
  ProjectsAddFolder,
  ProjectsGitMetadata,
  ProjectsList,
  ProjectsOpenInEditor,
  ProjectsRead,
  ProjectsRemoveFromSidebar,
  ProjectsRevealInFinder
} from "./projects";
import {
  TicketAnswerClarification,
  TicketCancelAgentUpdate,
  TicketClarifications,
  TicketCreateDraft,
  TicketCreateManual,
  TicketCreateSubticket,
  TicketDelete,
  TicketDuplicate,
  TicketGenerateSuggestions,
  TicketIntakeDraft,
  TicketLinkSubticket,
  TicketMove,
  TicketRead,
  TicketRedraft,
  TicketReferences,
  TicketRevealFile,
  TicketSave,
  TicketSaveAttachment,
  TicketStartAgentUpdate,
  TicketUnlinkSubticket
} from "./tickets";

export class RelayRpcGroup extends RpcGroup.make(
  ProjectsList,
  ProjectsAddFolder,
  ProjectsRemoveFromSidebar,
  ProjectsRead,
  ProjectsGitMetadata,
  ProjectsRevealInFinder,
  ProjectsOpenInEditor,
  BoardRead,
  TicketIntakeDraft,
  TicketCreateDraft,
  TicketRedraft,
  TicketGenerateSuggestions,
  TicketCreateManual,
  TicketCreateSubticket,
  TicketLinkSubticket,
  TicketUnlinkSubticket,
  TicketStartAgentUpdate,
  TicketCancelAgentUpdate,
  TicketReferences,
  TicketRead,
  TicketSave,
  TicketSaveAttachment,
  TicketMove,
  TicketClarifications,
  TicketAnswerClarification,
  TicketDelete,
  TicketDuplicate,
  TicketRevealFile,
  CodexStatus,
  CodexPreflightRun,
  CodexStartRun,
  CodexResumeRun,
  CodexCancelRun,
  CodexApproveAction,
  CodexSendRepositoryChatMessage,
  CodexReadRunEvents,
  CodexReadLatestRunSummary
) {}

export const relayRpcGroup = RelayRpcGroup;
export type RelayRpcs = RpcGroup.Rpcs<typeof RelayRpcGroup>;
export type RelayRpcClient = import("effect/unstable/rpc").RpcClient.RpcClient.Flat<RelayRpcs>;
