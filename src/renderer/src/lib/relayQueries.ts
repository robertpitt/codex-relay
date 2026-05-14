import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { DragEndEvent } from "@dnd-kit/core";
import type {
  AgentTicketUpdateInput,
  BoardSnapshot,
  CancelRunInput,
  ClarificationAnswerInput,
  CodexStatus,
  CreateDraftInput,
  EpicSubticketCreateInput,
  EpicSubticketLinkInput,
  EpicSubticketUnlinkInput,
  GitMetadata,
  GitMetadataOptions,
  ProjectOpenInEditorInput,
  RendererRunEvent,
  RepositoryChatInput,
  RunSummary,
  StartRunInput,
  TicketAttachmentSaveInput,
  TicketMoveInput,
  TicketRedraftInput,
  TicketRecord,
  TicketSaveInput
} from "@shared/schemas";
import { runRelayRpc, subscribeRelayRunEvents } from "./relayRpc";

type ProjectPath = string | null | undefined;
type TicketId = string | null | undefined;
type RunId = string | null | undefined;

export const relayQueryKeys = {
  projects: ["relay", "projects"] as const,
  board: (projectPath: ProjectPath) => ["relay", "board", projectPath ?? null] as const,
  ticket: (projectPath: ProjectPath, ticketId: TicketId) => ["relay", "ticket", projectPath ?? null, ticketId ?? null] as const,
  ticketClarifications: (projectPath: ProjectPath, ticketId: TicketId) =>
    ["relay", "ticket", projectPath ?? null, ticketId ?? null, "clarifications"] as const,
  ticketReferences: (projectPath: ProjectPath) => ["relay", "ticket-references", projectPath ?? null] as const,
  ticketSuggestions: (projectPath: ProjectPath) => ["relay", "ticket-suggestions", projectPath ?? null] as const,
  codexStatus: ["relay", "codex", "status"] as const,
  gitMetadata: (projectPath: ProjectPath) => ["relay", "git-metadata", projectPath ?? null] as const,
  runEvents: (projectPath: ProjectPath, ticketId: TicketId, runId: RunId) =>
    ["relay", "run-events", projectPath ?? null, ticketId ?? null, runId ?? null] as const,
  runSummary: (projectPath: ProjectPath, ticketId: TicketId) => ["relay", "run-summary", projectPath ?? null, ticketId ?? null] as const
};

export const relayErrorMessage = (error: unknown, fallback: string): string => (error instanceof Error ? error.message : fallback);

const invalidateProjectData = async (queryClient: QueryClient, projectPath?: string | null): Promise<void> => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: relayQueryKeys.projects }),
    projectPath ? queryClient.invalidateQueries({ queryKey: relayQueryKeys.board(projectPath) }) : Promise.resolve(),
    projectPath ? queryClient.invalidateQueries({ queryKey: relayQueryKeys.ticketReferences(projectPath) }) : Promise.resolve(),
    projectPath ? queryClient.invalidateQueries({ queryKey: relayQueryKeys.gitMetadata(projectPath) }) : Promise.resolve()
  ]);
};

const invalidateTicketData = async (queryClient: QueryClient, projectPath: string, ticketId?: string | null): Promise<void> => {
  await Promise.all([
    invalidateProjectData(queryClient, projectPath),
    ticketId ? queryClient.invalidateQueries({ queryKey: relayQueryKeys.ticket(projectPath, ticketId) }) : Promise.resolve(),
    ticketId ? queryClient.invalidateQueries({ queryKey: relayQueryKeys.ticketClarifications(projectPath, ticketId) }) : Promise.resolve(),
    ticketId ? queryClient.invalidateQueries({ queryKey: relayQueryKeys.runSummary(projectPath, ticketId) }) : Promise.resolve(),
    ticketId ? queryClient.invalidateQueries({ queryKey: ["relay", "run-events", projectPath, ticketId] }) : Promise.resolve()
  ]);
};

export const invalidateRelayProjectData = invalidateProjectData;
export const invalidateRelayTicketData = invalidateTicketData;

export const useProjectsQuery = () =>
  useQuery({
    queryKey: relayQueryKeys.projects,
    queryFn: () => runRelayRpc("projects:list", undefined)
  });

export const useBoardQuery = (projectPath: ProjectPath) =>
  useQuery({
    queryKey: relayQueryKeys.board(projectPath),
    queryFn: () => runRelayRpc("board:read", { projectPath: projectPath as string }),
    enabled: Boolean(projectPath)
  });

export const useTicketQuery = (projectPath: ProjectPath, ticketId: TicketId) =>
  useQuery({
    queryKey: relayQueryKeys.ticket(projectPath, ticketId),
    queryFn: () => runRelayRpc("ticket:read", { projectPath: projectPath as string, ticketId: ticketId as string }),
    enabled: Boolean(projectPath && ticketId)
  });

export const useTicketClarificationsQuery = (projectPath: ProjectPath, ticketId: TicketId) =>
  useQuery({
    queryKey: relayQueryKeys.ticketClarifications(projectPath, ticketId),
    queryFn: () => runRelayRpc("ticket:clarifications", { projectPath: projectPath as string, ticketId: ticketId as string }),
    enabled: Boolean(projectPath && ticketId)
  });

export const useTicketReferencesQuery = (projectPath: ProjectPath) =>
  useQuery({
    queryKey: relayQueryKeys.ticketReferences(projectPath),
    queryFn: () => runRelayRpc("ticket:references", { projectPath: projectPath as string }),
    enabled: Boolean(projectPath)
  });

export const useTicketSuggestionsQuery = (projectPath: ProjectPath, enabled: boolean) =>
  useQuery({
    queryKey: relayQueryKeys.ticketSuggestions(projectPath),
    queryFn: () => runRelayRpc("ticket:generateSuggestions", { projectPath: projectPath as string }),
    enabled: Boolean(projectPath) && enabled,
    staleTime: 0
  });

export const useCodexStatusQuery = () =>
  useQuery({
    queryKey: relayQueryKeys.codexStatus,
    queryFn: () => runRelayRpc("codex:status", undefined),
    initialData: {
      sdkAvailable: false,
      cliAvailable: false,
      cliVersion: null,
      authenticated: null,
      message: "Checking Codex..."
    } satisfies CodexStatus
  });

export const useProjectGitMetadataQuery = (projectPath: ProjectPath, options?: GitMetadataOptions) =>
  useQuery({
    queryKey: relayQueryKeys.gitMetadata(projectPath),
    queryFn: () => runRelayRpc("projects:gitMetadata", { projectPath: projectPath as string, options }),
    enabled: Boolean(projectPath),
    retry: false
  });

export const useRunEventsQuery = (projectPath: ProjectPath, ticketId: TicketId, runId: RunId) =>
  useQuery({
    queryKey: relayQueryKeys.runEvents(projectPath, ticketId, runId),
    queryFn: () =>
      runRelayRpc("codex:readRunEvents", {
        projectPath: projectPath as string,
        ticketId: ticketId as string,
        runId: runId as string
      }),
    enabled: Boolean(projectPath && ticketId && runId)
  });

export const useRunSummaryQuery = (projectPath: ProjectPath, ticketId: TicketId) =>
  useQuery({
    queryKey: relayQueryKeys.runSummary(projectPath, ticketId),
    queryFn: () => runRelayRpc("codex:readLatestRunSummary", { projectPath: projectPath as string, ticketId: ticketId as string }),
    enabled: Boolean(projectPath && ticketId)
  });

export const useAddProjectMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => runRelayRpc("projects:addFolder", undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: relayQueryKeys.projects });
    }
  });
};

export const useRemoveProjectMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectPath: string) => runRelayRpc("projects:removeFromSidebar", { projectPath }),
    onSuccess: async (_projects, projectPath) => {
      await invalidateProjectData(queryClient, projectPath);
    }
  });
};

export const useRevealProjectMutation = () => useMutation({ mutationFn: (projectPath: string) => runRelayRpc("projects:revealInFinder", { projectPath }) });

export const relayOpenProjectInEditor = (input: ProjectOpenInEditorInput) => runRelayRpc("projects:openInEditor", input);

export const useOpenProjectInEditorMutation = () =>
  useMutation({ mutationFn: relayOpenProjectInEditor });

export const useRefreshCodexStatusMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => runRelayRpc("codex:status", undefined),
    onSuccess: (status) => queryClient.setQueryData(relayQueryKeys.codexStatus, status)
  });
};

export const useMoveTicketMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TicketMoveInput) => runRelayRpc("ticket:move", input),
    onSuccess: async (board, input) => {
      queryClient.setQueryData(relayQueryKeys.board(input.projectPath), board);
      await invalidateTicketData(queryClient, input.projectPath, input.ticketId);
    }
  });
};

export const useCreateDraftMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDraftInput) => runRelayRpc("ticket:createDraft", input),
    onSuccess: async (_result, input) => {
      await invalidateProjectData(queryClient, input.projectPath);
    }
  });
};

export const useRedraftTicketMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TicketRedraftInput) => runRelayRpc("ticket:redraft", input),
    onSuccess: async (_result, input) => {
      await invalidateTicketData(queryClient, input.projectPath, input.ticketId);
    }
  });
};

export const useSaveTicketMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TicketSaveInput) => runRelayRpc("ticket:save", input),
    onSuccess: async (ticket, input) => {
      queryClient.setQueryData(relayQueryKeys.ticket(input.projectPath, ticket.frontMatter.id), ticket);
      await invalidateTicketData(queryClient, input.projectPath, ticket.frontMatter.id);
    }
  });
};

export const useSaveTicketAttachmentMutation = () =>
  useMutation({ mutationFn: (input: TicketAttachmentSaveInput) => runRelayRpc("ticket:saveAttachment", input) });

export const useStartTicketUpdateMutation = () =>
  useMutation({ mutationFn: (input: AgentTicketUpdateInput) => runRelayRpc("ticket:startAgentUpdate", input) });

export const useCancelTicketUpdateMutation = () =>
  useMutation({ mutationFn: (runId: string) => runRelayRpc("ticket:cancelAgentUpdate", { runId }) });

export const usePreflightRunMutation = () => useMutation({ mutationFn: (input: StartRunInput) => runRelayRpc("codex:preflightRun", input) });

export const useStartRunMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ resume, input }: { resume: boolean; input: StartRunInput }) =>
      resume ? runRelayRpc("codex:resumeRun", input) : runRelayRpc("codex:startRun", input),
    onSuccess: async (_result, { input }) => {
      await invalidateTicketData(queryClient, input.projectPath, input.ticketId);
    }
  });
};

export const useCancelRunMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CancelRunInput) => runRelayRpc("codex:cancelRun", input),
    onSuccess: async (_result, input) => {
      await invalidateTicketData(queryClient, input.projectPath, input.ticketId);
    }
  });
};

export const useAnswerClarificationMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ClarificationAnswerInput) => runRelayRpc("ticket:answerClarification", input),
    onSuccess: async (_question, input) => {
      await invalidateTicketData(queryClient, input.projectPath, input.ticketId);
    }
  });
};

export const useDeleteTicketMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectPath, ticketId }: { projectPath: string; ticketId: string }) => runRelayRpc("ticket:delete", { projectPath, ticketId }),
    onSuccess: async (_board, input) => {
      await invalidateTicketData(queryClient, input.projectPath, input.ticketId);
    }
  });
};

export const useDuplicateTicketMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectPath, ticketId }: { projectPath: string; ticketId: string }) => runRelayRpc("ticket:duplicate", { projectPath, ticketId }),
    onSuccess: async (_ticket, input) => {
      await invalidateTicketData(queryClient, input.projectPath, input.ticketId);
    }
  });
};

export const useCreateSubticketMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: EpicSubticketCreateInput) => runRelayRpc("ticket:createSubticket", input),
    onSuccess: async (_ticket, input) => {
      await invalidateTicketData(queryClient, input.projectPath, input.epicId);
    }
  });
};

export const useLinkSubticketMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: EpicSubticketLinkInput) => runRelayRpc("ticket:linkSubticket", input),
    onSuccess: async (_board, input) => {
      await invalidateTicketData(queryClient, input.projectPath, input.epicId);
    }
  });
};

export const useUnlinkSubticketMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: EpicSubticketUnlinkInput) => runRelayRpc("ticket:unlinkSubticket", input),
    onSuccess: async (_board, input) => {
      await invalidateTicketData(queryClient, input.projectPath, input.epicId);
    }
  });
};

export const useRevealTicketFileMutation = () =>
  useMutation({ mutationFn: ({ projectPath, ticketId }: { projectPath: string; ticketId: string }) => runRelayRpc("ticket:revealFile", { projectPath, ticketId }) });

export const useRepositoryChatMutation = () =>
  useMutation({
    mutationFn: (input: RepositoryChatInput) => runRelayRpc("codex:sendRepositoryChatMessage", input)
  });

export const useRunEventSubscription = (listener: (event: RendererRunEvent) => void): (() => void) => subscribeRelayRunEvents(listener);

export type BoardMoveInput = DragEndEvent;
export type TicketMutationResult = TicketRecord | BoardSnapshot | void;
export type GitMetadataQueryData = GitMetadata;
export type RunSummaryQueryData = RunSummary | null;
