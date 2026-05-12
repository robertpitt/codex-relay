import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import clsx from "clsx";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Check,
  CircleDashed,
  Clock,
  Code2,
  Copy,
  ExternalLink,
  Folder,
  FolderOpen,
  FolderPlus,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, KeyboardEvent, ReactElement } from "react";
import { RELAY_IN_PROGRESS_STATUS } from "@shared/types";
import type {
  BoardSnapshot,
  ClarificationQuestion,
  CodexRunPreflightResult,
  CodexStatus,
  GitMetadata,
  ProjectSummary,
  RelayApi,
  RelayColumn,
  RendererRunEvent,
  RunSummary,
  RunStatus,
  TicketAttachmentSaveResult,
  TicketDraft,
  TicketDraftErrorPayload,
  TicketDraftSubticket,
  TicketPriority,
  TicketReferenceCandidate,
  TicketRecord,
  TicketSuggestion,
  TicketSummary,
  TicketType
} from "@shared/types";
import {
  resolveTicketBlockers,
  resolvedBlockerLabel,
  ticketBlockerOptionLabel,
  ticketContextLabel
} from "@shared/blockers";
import { AgentActivityPanel, AgentLogViewer, AgentProgressSummary } from "./components/AgentActivity";
import { ClarificationPanel } from "./components/ClarificationPanel";
import { GitMetadataPill, loadingGitMetadata } from "./components/GitMetadata";
import { MarkdownBlock } from "./components/MarkdownBlock";
import { formatElapsedDuration, isAgentSessionActive, mergeRunEvents } from "./lib/agentProgress";
import {
  attachmentMarkdownBlock,
  droppedImageFileToAttachmentInput,
  insertMarkdownAtSelection,
  isSupportedDroppedImageFile
} from "./lib/attachments";
import {
  createTicketShortcutLabel,
  isCreateTicketShortcut,
  KeyboardShortcutProvider,
  ticketNavigationDirection,
  ticketNavigationShortcutLabel,
  useKeyboardShortcut,
  useShortcutOverlay,
  type ShortcutDirection
} from "./lib/keyboardShortcuts";
import { markdownFromDraft, markdownFromSubticketDraft, ticketDraftDialogSubtext } from "./lib/markdown";
import { getRelayApi, hasRelayApi } from "./lib/relayApi";
import {
  filterTicketReferenceCandidates,
  getActiveTicketMention,
  replaceTicketMention,
  type TicketMentionToken
} from "./lib/ticketReferences";

type Toast = { kind: "info" | "error" | "success"; message: string } | null;
type LocalAgentProgress = { status: RunStatus; startedAt: string; endedAt?: string | null };
type TicketSuggestionCreateState = "idle" | "creating" | "created";
type TicketSuggestionLoadState = "loading" | "error" | "ready";
type ActiveTicketReferenceMention = {
  token: TicketMentionToken;
};

const ticketSuggestionRequests = new Map<string, ReturnType<RelayApi["ticket"]["generateSuggestions"]>>();

type DraftArrayField =
  | "labels"
  | "researchFindings"
  | "requirements"
  | "implementationPlan"
  | "testPlan"
  | "acceptanceCriteria"
  | "clarificationQuestions"
  | "assumptions"
  | "implementationNotes";

type TicketReferenceMenuRect = {
  left: number;
  top: number;
  bottom: number;
  width: number;
};

export type TicketReferenceMenuLayout = {
  placement: "above" | "below";
  style: CSSProperties;
};

export type TicketReferenceMenuLayoutInput = {
  anchorRect: TicketReferenceMenuRect;
  footerTop?: number | null;
  viewportWidth: number;
  viewportHeight: number;
  gap?: number;
  margin?: number;
  desiredMaxHeight?: number;
  minimumUsableHeight?: number;
};

export const getTicketReferenceMenuLayout = ({
  anchorRect,
  footerTop,
  viewportWidth,
  viewportHeight,
  gap = 6,
  margin = 12,
  desiredMaxHeight = 260,
  minimumUsableHeight = 160
}: TicketReferenceMenuLayoutInput): TicketReferenceMenuLayout => {
  const maxHeight = Math.min(desiredMaxHeight, Math.floor(viewportHeight * 0.48));
  const footerBoundary = footerTop === null || footerTop === undefined ? viewportHeight - margin : footerTop - margin;
  const belowBoundary = Math.min(viewportHeight - margin, footerBoundary);
  const spaceBelow = Math.max(0, belowBoundary - anchorRect.bottom - gap);
  const spaceAbove = Math.max(0, anchorRect.top - margin - gap);
  const usableHeight = Math.min(minimumUsableHeight, maxHeight);
  const placement = spaceBelow >= usableHeight || spaceBelow >= spaceAbove ? "below" : "above";
  const availableHeight = placement === "below" ? spaceBelow : spaceAbove;
  const width = Math.min(anchorRect.width, Math.max(160, viewportWidth - margin * 2));
  const left = Math.max(margin, Math.min(anchorRect.left, viewportWidth - margin - width));
  const style: CSSProperties = {
    position: "fixed",
    zIndex: 80,
    left,
    right: "auto",
    width,
    maxHeight: Math.max(80, Math.min(maxHeight, availableHeight))
  };

  if (placement === "below") {
    style.top = anchorRect.bottom + gap;
    style.bottom = "auto";
  } else {
    style.top = "auto";
    style.bottom = viewportHeight - anchorRect.top + gap;
  }

  return { placement, style };
};

const priorityOptions: TicketPriority[] = ["low", "medium", "high", "urgent"];
const ticketTypeOptions: TicketType[] = ["task", "epic"];

const initialCodexStatus: CodexStatus = {
  sdkAvailable: false,
  cliAvailable: false,
  cliVersion: null,
  authenticated: null,
  message: "Checking Codex..."
};

const projectDisclosureTargetId = (project: ProjectSummary, index: number): string => {
  const stableKey = project.projectId ?? `${project.name}-${index}-${project.path}`;
  return `project-swimlanes-${stableKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
};

const taskCountLabel = (count: number): string => `${count} ${count === 1 ? "task" : "tasks"}`;
const activeTaskCountLabel = (count: number): string => `${count} active ${count === 1 ? "task" : "tasks"}`;

const runLabel = (status: RunStatus): string => {
  switch (status) {
    case "idle":
      return "Idle";
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "blocked":
      return "Blocked";
    case "failed":
      return "Failed";
    case "completed":
      return "Codex Done";
    case "cancelled":
      return "Cancelled";
    case "drafting":
      return "Drafting";
    case "draft_failed":
      return "Draft Failed";
    case "draft_complete":
      return "Draft Ready";
    default:
      return "Idle";
  }
};

export function TicketRunStatusPill({ status }: { status: RunStatus }): ReactElement {
  return (
    <span className={clsx("run-pill", status)}>
      {status === "drafting" && <Loader2 className="spin run-pill-icon" size={12} aria-hidden="true" />}
      <span>{runLabel(status)}</span>
    </span>
  );
}

export const activeRunElapsedLabel = (
  ticket: Pick<TicketSummary, "status" | "runStatus" | "lastRunStartedAt">,
  now: number
): string | null => {
  if (ticket.status !== RELAY_IN_PROGRESS_STATUS || ticket.runStatus !== "running" || !ticket.lastRunStartedAt) return null;
  const startedAt = Date.parse(ticket.lastRunStartedAt);
  if (Number.isNaN(startedAt)) return null;
  const elapsedMs = now - startedAt;
  if (!Number.isFinite(elapsedMs)) return null;
  return formatElapsedDuration(elapsedMs);
};

export function TicketRunElapsedPill({ label }: { label: string }): ReactElement {
  const title = `Agent running for ${label}`;
  return (
    <span className="run-elapsed-pill" title={title} aria-label={title}>
      <Clock className="run-pill-icon" size={12} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function DraftingTicketDetailLoading({ title }: { title: string }): ReactElement {
  return (
    <section className="draft-loading-panel" aria-label="Ticket draft loading state">
      <Loader2 className="spin" size={22} aria-hidden="true" />
      <div>
        <h3>Drafting ticket</h3>
        <p>Codex is preparing the generated ticket content for {title}.</p>
      </div>
    </section>
  );
}

const ticketTypeLabel = (ticketType: TicketType): string => (ticketType === "epic" ? "Epic" : "Task");

const labelsFromInput = (value: string): string[] =>
  value
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);

const linesFromInput = (value: string): string[] =>
  value.split("\n");

const linesToInput = (items: string[]): string => items.join("\n");

const sameStringArray = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((item, index) => item === right[index]);

const manualSubticketMarkdown = (childTitle: string, parentTitle: string): string => `# ${childTitle}

## Parent Epic

${parentTitle}

## Context

Subticket of ${parentTitle}.

## Codebase Findings

- None.

## Requirements

- Define the unique scope for this child task before starting implementation.

## Implementation Plan

- Review the parent epic context and narrow this ticket to one implementation path.

## Test Plan

- Run the relevant focused validation for the child task once implemented.

## Acceptance Criteria

- The child task has specific acceptance criteria before work starts.

## Assumptions / Open Questions

- None.

## Implementation Notes

- None.

## Codex Handoff

No Codex run has been started.
`;

const statusName = (columns: RelayColumn[], status: string): string =>
  columns.find((column) => column.id === status)?.name ?? status;

const emptyColumnMessage = (columnName: string): { title: string; detail: string } => ({
  title: `${columnName} is clear`,
  detail: "Tickets will settle here when work reaches this stage."
});

// Markdown audit: create-ticket drafts, ticket detail bodies, clarification text,
// and generated Codex completion/final-response console events use MarkdownBlock.
// Board excerpts and command output stay plain text because they are summaries/logs.
const copyToast = (kind: "markdown" | "code"): Toast => ({
  kind: "success",
  message: kind === "code" ? "Code copied." : "Markdown source copied."
});

const generateTicketSuggestionsOnce = (projectPath: string): ReturnType<RelayApi["ticket"]["generateSuggestions"]> => {
  const existing = ticketSuggestionRequests.get(projectPath);
  if (existing) return existing;

  const request = getRelayApi()
    .ticket.generateSuggestions(projectPath)
    .finally(() => {
      if (ticketSuggestionRequests.get(projectPath) === request) {
        ticketSuggestionRequests.delete(projectPath);
      }
    });
  ticketSuggestionRequests.set(projectPath, request);
  return request;
};

export function ProjectSidebar({
  projects,
  selectedPath,
  loading,
  onAdd,
  onSelect,
  onRemove,
  onReveal,
  defaultExpandedProjectPaths = []
}: {
  projects: ProjectSummary[];
  selectedPath: string | null;
  loading: boolean;
  onAdd: () => void;
  onSelect: (projectPath: string) => void;
  onRemove: (projectPath: string) => void;
  onReveal: (projectPath: string) => void;
  defaultExpandedProjectPaths?: string[];
}): ReactElement {
  const [expandedProjectPaths, setExpandedProjectPaths] = useState<Set<string>>(
    () => new Set([...defaultExpandedProjectPaths, ...(selectedPath ? [selectedPath] : [])])
  );

  useEffect(() => {
    if (!selectedPath) return;
    setExpandedProjectPaths((current) => {
      if (current.has(selectedPath)) return current;
      const next = new Set(current);
      next.add(selectedPath);
      return next;
    });
  }, [selectedPath]);

  const handleProjectClick = useCallback(
    (projectPath: string): void => {
      onSelect(projectPath);
      setExpandedProjectPaths((current) => {
        const next = new Set(current);
        if (selectedPath === projectPath && next.has(projectPath)) {
          next.delete(projectPath);
        } else {
          next.add(projectPath);
        }
        return next;
      });
    },
    [onSelect, selectedPath]
  );

  return (
    <aside className="sidebar" aria-label="Projects">
      <div className="sidebar-heading">
        <span>Projects</span>
        <button className="sidebar-icon-button" onClick={onAdd} disabled={loading} aria-label="Add project">
          {loading ? <Loader2 className="spin" size={16} /> : <FolderPlus size={16} />}
        </button>
      </div>

      <div className="sidebar-list" role="list">
        {projects.map((project, index) => {
          const expanded = expandedProjectPaths.has(project.path);
          const swimlaneListId = projectDisclosureTargetId(project, index);
          const ProjectFolderIcon = expanded ? FolderOpen : Folder;
          const projectActiveLabel = project.activeRunCount > 0 ? `, ${activeTaskCountLabel(project.activeRunCount)}` : "";
          return (
            <div className="project-group" key={project.path} role="listitem">
              <button
                type="button"
                className={clsx("project-folder-row", selectedPath === project.path && "selected", expanded && "expanded")}
                onClick={() => handleProjectClick(project.path)}
                aria-current={selectedPath === project.path ? "page" : undefined}
                aria-expanded={expanded}
                aria-controls={swimlaneListId}
                aria-label={`${expanded ? "Collapse" : "Expand"} ${project.name} swimlanes${projectActiveLabel}`}
              >
                <ProjectFolderIcon className="project-folder-icon" size={18} aria-hidden="true" />
                <span className="project-folder-name">{project.name}</span>
                <span className="project-folder-status" aria-hidden="true">
                  {project.health !== "ok" && <AlertTriangle size={13} />}
                  {project.activeRunCount > 0 && (
                    <span className="project-folder-active" title={activeTaskCountLabel(project.activeRunCount)}>
                      <CircleDashed size={13} />
                    </span>
                  )}
                </span>
              </button>
              {expanded && (
                <div id={swimlaneListId} className="project-swimlane-list" role="list" aria-label={`${project.name} swimlanes`}>
                  {project.swimlanes.length > 0 ? (
                    project.swimlanes.map((swimlane) => {
                      const hasActiveRun = swimlane.activeRunCount > 0;
                      const activeLabel = hasActiveRun ? `, ${activeTaskCountLabel(swimlane.activeRunCount)}` : "";
                      return (
                        <div
                          className={clsx("project-swimlane-row", hasActiveRun && "active")}
                          key={swimlane.id}
                          role="listitem"
                          aria-label={`${swimlane.name}: ${taskCountLabel(swimlane.ticketCount)}${activeLabel}`}
                        >
                          <span className="project-swimlane-name">{swimlane.name}</span>
                          <span className="project-swimlane-meta">
                            {hasActiveRun && (
                              <span className="project-swimlane-active" title={activeTaskCountLabel(swimlane.activeRunCount)} aria-hidden="true">
                                <Loader2 className="spin" size={12} />
                              </span>
                            )}
                            <span className="project-swimlane-count" aria-hidden="true">
                              {swimlane.ticketCount}
                            </span>
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="project-swimlane-empty" role="listitem">
                      No swimlanes
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedPath && (
        <div className="sidebar-actions">
          <button onClick={() => onReveal(selectedPath)}>
            <ExternalLink size={15} />
            Reveal
          </button>
          <button onClick={() => onRemove(selectedPath)}>
            <X size={15} />
            Remove
          </button>
        </div>
      )}
    </aside>
  );
}

function DroppableColumn({
  column,
  tickets,
  allTickets,
  columns,
  selectedTicketId,
  onOpen,
  onTicketFocus,
  onTicketButtonRef,
  now
}: {
  column: RelayColumn;
  tickets: TicketSummary[];
  allTickets: TicketSummary[];
  columns: RelayColumn[];
  selectedTicketId: string | null;
  onOpen: (ticketId: string) => void;
  onTicketFocus: (ticketId: string) => void;
  onTicketButtonRef: (ticketId: string, node: HTMLButtonElement | null) => void;
  now: number;
}): ReactElement {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const emptyMessage = emptyColumnMessage(column.name);
  return (
    <section ref={setNodeRef} className={clsx("board-column", isOver && "over")}>
      <header className="column-header">
        <h2>{column.name}</h2>
        <span>{tickets.length}</span>
      </header>
      <div className="column-body">
        {tickets.map((ticket) => (
          <DraggableCard
            key={ticket.id}
            ticket={ticket}
            allTickets={allTickets}
            columns={columns}
            selected={ticket.id === selectedTicketId}
            onOpen={onOpen}
            onFocus={onTicketFocus}
            onTicketButtonRef={onTicketButtonRef}
            now={now}
          />
        ))}
        {tickets.length === 0 && (
          <div className="empty-column">
            <span>{emptyMessage.title}</span>
            <p>{emptyMessage.detail}</p>
          </div>
        )}
      </div>
    </section>
  );
}

export function TicketCardContent({
  ticket,
  allTickets,
  columns,
  now
}: {
  ticket: TicketSummary;
  allTickets: TicketSummary[];
  columns: RelayColumn[];
  now: number;
}): ReactElement {
  const visibleLabels = ticket.labels.slice(0, 2);
  const hiddenLabelCount = ticket.labels.length - visibleLabels.length;
  const showPriority = ticket.priority === "high" || ticket.priority === "urgent";
  const showRunStatus = ticket.runStatus !== "idle";
  const elapsedLabel = activeRunElapsedLabel(ticket, now);
  const showRelationship = ticket.ticketType === "epic" || Boolean(ticket.parentEpicId);
  const blockerState = useMemo(() => resolveTicketBlockers(ticket, allTickets, columns), [allTickets, columns, ticket]);
  const showBlockerState = blockerState.isBlocked || blockerState.warnings.length > 0;

  return (
    <>
      <div className="card-title">{ticket.title}</div>
      <p className="card-excerpt">{ticket.excerpt || "No details yet."}</p>
      {(showRelationship || showPriority || showRunStatus || showBlockerState || elapsedLabel) && (
        <div className="card-meta">
          {ticket.ticketType === "epic" && <span className="ticket-type-pill epic">Epic</span>}
          {ticket.parentEpicId && <span className="ticket-type-pill subticket">Subticket</span>}
          {blockerState.isBlocked && (
            <span className="ticket-blocker-pill active" title={blockerState.activeBlockers.map(resolvedBlockerLabel).join("; ")}>
              Blocked
            </span>
          )}
          {blockerState.warnings.length > 0 && (
            <span className="ticket-blocker-pill warning" title={blockerState.warnings.join(" ")}>
              Blocker Warning
            </span>
          )}
          {showPriority && <span className={clsx("priority", ticket.priority)}>{ticket.priority}</span>}
          {showRunStatus && <TicketRunStatusPill status={ticket.runStatus} />}
          {elapsedLabel && <TicketRunElapsedPill label={elapsedLabel} />}
        </div>
      )}
      {visibleLabels.length > 0 && (
        <div className="labels">
          {visibleLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
          {hiddenLabelCount > 0 && <span className="label-overflow">+{hiddenLabelCount}</span>}
        </div>
      )}
    </>
  );
}

function DraggableCard({
  ticket,
  allTickets,
  columns,
  selected,
  onOpen,
  onFocus,
  onTicketButtonRef,
  now
}: {
  ticket: TicketSummary;
  allTickets: TicketSummary[];
  columns: RelayColumn[];
  selected: boolean;
  onOpen: (ticketId: string) => void;
  onFocus: (ticketId: string) => void;
  onTicketButtonRef: (ticketId: string, node: HTMLButtonElement | null) => void;
  now: number;
}): ReactElement {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: ticket.id });
  const dragTransform = transform ? CSS.Translate.toString(transform) : null;
  const style = dragTransform ? { transform: dragTransform } : undefined;
  return (
    <article ref={setNodeRef} style={style} className={clsx("ticket-card", isDragging && "dragging", selected && "keyboard-selected")}>
      <button
        ref={(node) => onTicketButtonRef(ticket.id, node)}
        className="card-open"
        data-ticket-id={ticket.id}
        onClick={() => onOpen(ticket.id)}
        onFocus={() => onFocus(ticket.id)}
      >
        <TicketCardContent ticket={ticket} allTickets={allTickets} columns={columns} now={now} />
      </button>
      <button className="drag-handle" {...listeners} {...attributes} aria-label={`Drag ${ticket.title}`}>
        <CircleDashed size={16} />
      </button>
    </article>
  );
}

function BoardView({
  board,
  query,
  ticketNavigationEnabled,
  onQuery,
  onCreate,
  onGenerateTickets,
  onOpenTicket,
  onMove,
  gitMetadata
}: {
  board: BoardSnapshot;
  query: string;
  ticketNavigationEnabled: boolean;
  onQuery: (query: string) => void;
  onCreate: () => void;
  onGenerateTickets: () => void;
  onOpenTicket: (ticketId: string) => void;
  onMove: (event: DragEndEvent) => void;
  gitMetadata: GitMetadata | undefined;
}): ReactElement {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const boardRef = useRef<HTMLDivElement | null>(null);
  const ticketButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const filteredTickets = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return board.tickets;
    return board.tickets.filter((ticket) => {
      const haystack = `${ticket.title} ${ticket.excerpt} ${ticket.labels.join(" ")}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [board.tickets, query]);
  const orderedTickets = useMemo(
    () =>
      board.columns.flatMap((column) =>
        filteredTickets.filter((ticket) => ticket.status === column.id).sort((a, b) => a.position - b.position)
      ),
    [board.columns, filteredTickets]
  );
  const orderedTicketIds = useMemo(() => orderedTickets.map((ticket) => ticket.id), [orderedTickets]);
  const hasActiveElapsedLabel = useMemo(
    () => orderedTickets.some((ticket) => activeRunElapsedLabel(ticket, now) !== null),
    [orderedTickets, now]
  );
  const createShortcut = createTicketShortcutLabel();

  const setTicketButtonRef = useCallback((ticketId: string, node: HTMLButtonElement | null): void => {
    if (node) {
      ticketButtonRefs.current.set(ticketId, node);
    } else {
      ticketButtonRefs.current.delete(ticketId);
    }
  }, []);

  const isBoardBrowsingTarget = useCallback((event: Parameters<typeof ticketNavigationDirection>[0]): boolean => {
    const boardNode = boardRef.current;
    if (!boardNode) return false;
    if (event.target === document.body || event.target === document.documentElement) return true;
    return event.target instanceof Node && boardNode.contains(event.target);
  }, []);

  const focusTicket = useCallback(
    (direction: ShortcutDirection): boolean => {
      if (orderedTicketIds.length === 0) return false;

      const activeTicket = document.activeElement instanceof Element ? document.activeElement.closest<HTMLElement>("[data-ticket-id]") : null;
      const currentTicketId = activeTicket?.dataset.ticketId ?? selectedTicketId;
      const currentIndex = currentTicketId ? orderedTicketIds.indexOf(currentTicketId) : -1;
      const nextIndex =
        direction === "next"
          ? currentIndex < 0
            ? 0
            : (currentIndex + 1) % orderedTicketIds.length
          : currentIndex < 0
            ? orderedTicketIds.length - 1
            : (currentIndex - 1 + orderedTicketIds.length) % orderedTicketIds.length;
      const nextTicketId = orderedTicketIds[nextIndex];
      const nextButton = ticketButtonRefs.current.get(nextTicketId);

      if (!nextButton) return false;
      nextButton.focus();
      setSelectedTicketId(nextTicketId);
      return true;
    },
    [orderedTicketIds, selectedTicketId]
  );

  useEffect(() => {
    if (selectedTicketId && !orderedTicketIds.includes(selectedTicketId)) {
      setSelectedTicketId(null);
    }
  }, [orderedTicketIds, selectedTicketId]);

  useEffect(() => {
    if (!hasActiveElapsedLabel) return;
    const updateNow = (): void => setNow(Date.now());
    updateNow();
    const interval = window.setInterval(updateNow, 1000);
    return () => window.clearInterval(interval);
  }, [hasActiveElapsedLabel]);

  useKeyboardShortcut({
    id: "ticket-navigation",
    enabled: ticketNavigationEnabled && orderedTicketIds.length > 0,
    matcher: (event) => ticketNavigationDirection(event) !== null && isBoardBrowsingTarget(event),
    handler: (event) => {
      const direction = ticketNavigationDirection(event);
      return direction ? focusTicket(direction) : false;
    }
  });

  return (
    <main className="workspace">
      <div className="topbar">
        <div>
          <h1>{board.project.name}</h1>
          <div className="project-header-meta">
            <p>{board.project.path}</p>
            <GitMetadataPill metadata={gitMetadata ?? loadingGitMetadata()} />
          </div>
        </div>
        <div className="topbar-actions">
          <label className="search">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              placeholder="Search tickets"
              aria-label="Search tickets"
            />
          </label>
          <button
            onClick={onGenerateTickets}
            title="Generate ticket suggestions"
          >
            <Sparkles size={16} />
            Generate Tickets
          </button>
          <button
            className="primary-button"
            onClick={onCreate}
            aria-keyshortcuts="Meta+Space Control+Space"
            title={`Create Ticket (${createShortcut})`}
          >
            <Plus size={16} />
            Create Ticket
            <kbd>{createShortcut}</kbd>
          </button>
        </div>
      </div>

      {board.project.healthMessages.length > 0 && (
        <div className={clsx("health", board.project.health)} role="status">
          <AlertTriangle size={17} />
          <span>{board.project.healthMessages.join(" ")}</span>
        </div>
      )}

      {board.invalidTickets.length > 0 && (
        <div className="health error" role="alert">
          <AlertTriangle size={17} />
          <span>{board.invalidTickets.length} ticket file(s) could not be loaded.</span>
        </div>
      )}

      <DndContext sensors={sensors} onDragEnd={onMove}>
        <p className="sr-only" id="ticket-navigation-shortcuts">
          Use {ticketNavigationShortcutLabel} to move between tickets. Tab moves through controls normally.
        </p>
        <div
          ref={boardRef}
          className={clsx("board", selectedTicketId && "board-has-focus")}
          tabIndex={orderedTicketIds.length > 0 ? 0 : undefined}
          aria-describedby="ticket-navigation-shortcuts"
          aria-keyshortcuts="ArrowDown ArrowUp ArrowRight ArrowLeft J K"
          title={`Move between tickets: ${ticketNavigationShortcutLabel}. Tab moves through controls normally.`}
        >
          {board.columns.map((column) => (
            <DroppableColumn
              key={column.id}
              column={column}
              tickets={orderedTickets.filter((ticket) => ticket.status === column.id)}
              allTickets={board.tickets}
              columns={board.columns}
              selectedTicketId={selectedTicketId}
              onOpen={onOpenTicket}
              onTicketFocus={setSelectedTicketId}
              onTicketButtonRef={setTicketButtonRef}
              now={now}
            />
          ))}
        </div>
      </DndContext>
    </main>
  );
}

export function TicketSuggestionsModalContent({
  state,
  suggestions,
  errorMessage,
  createStates,
  createErrors,
  onCreate,
  onRetry
}: {
  state: TicketSuggestionLoadState;
  suggestions: TicketSuggestion[];
  errorMessage: string | null;
  createStates: Record<number, TicketSuggestionCreateState>;
  createErrors: Record<number, string | undefined>;
  onCreate: (index: number) => void;
  onRetry?: () => void;
}): ReactElement {
  if (state === "loading") {
    return (
      <div className="draft-message ticket-suggestions-status" role="status">
        <Loader2 className="spin" size={15} />
        <span>Codex is reviewing the local project and current board.</span>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="draft-message error ticket-suggestions-status" role="alert">
        <AlertTriangle size={15} />
        <span>{errorMessage ?? "Unable to generate ticket suggestions."}</span>
        {onRetry && (
          <button type="button" onClick={onRetry}>
            <RefreshCw size={14} />
            Retry
          </button>
        )}
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="ticket-suggestions-empty" role="status">
        <strong>No suggestions returned</strong>
        <span>Codex did not find a task-sized ticket that was distinct from the current board.</span>
      </div>
    );
  }

  return (
    <div className="ticket-suggestions-list" aria-label="Generated ticket suggestions">
      {suggestions.map((suggestion, index) => {
        const createState = createStates[index] ?? "idle";
        const createError = createErrors[index];
        const created = createState === "created";
        const creating = createState === "creating";
        return (
          <article className={clsx("ticket-suggestion-row", created && "created")} key={`${suggestion.title}-${index}`}>
            <div className="ticket-suggestion-main">
              <div className="ticket-suggestion-heading">
                <h3>{suggestion.title}</h3>
                <span className={clsx("priority", suggestion.priority)}>{suggestion.priority}</span>
              </div>
              {suggestion.labels.length > 0 && (
                <div className="labels ticket-suggestion-labels">
                  {suggestion.labels.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
              )}
              <p>{suggestion.rationale}</p>
              <div className="ticket-suggestion-request">
                <span>Request</span>
                <strong>{suggestion.request}</strong>
              </div>
              {createError && (
                <div className="draft-message error ticket-suggestion-create-error" role="alert">
                  <AlertTriangle size={14} />
                  <span>{createError}</span>
                </div>
              )}
            </div>
            <button
              type="button"
              className="primary-button ticket-suggestion-create"
              onClick={() => onCreate(index)}
              disabled={creating || created}
              aria-label={`${created ? "Created" : "Create draft for"} ${suggestion.title}`}
            >
              {creating ? <Loader2 className="spin" size={16} /> : created ? <Check size={16} /> : <Plus size={16} />}
              {creating ? "Creating..." : created ? "Created" : "Create"}
            </button>
          </article>
        );
      })}
    </div>
  );
}

function TicketSuggestionsModal({
  projectPath,
  onClose,
  onCreated,
  setToast
}: {
  projectPath: string;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
  setToast: (toast: Toast) => void;
}): ReactElement {
  const [state, setState] = useState<TicketSuggestionLoadState>("loading");
  const [suggestions, setSuggestions] = useState<TicketSuggestion[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createStates, setCreateStates] = useState<Record<number, TicketSuggestionCreateState>>({});
  const [createErrors, setCreateErrors] = useState<Record<number, string | undefined>>({});
  const requestSequenceRef = useRef(0);

  useShortcutOverlay({
    id: "ticket-suggestions-modal",
    priority: 100,
    onEscape: () => {
      onClose();
      return true;
    }
  });

  const startGeneration = useCallback((): void => {
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    setState("loading");
    setSuggestions([]);
    setErrorMessage(null);
    setCreateStates({});
    setCreateErrors({});

    void generateTicketSuggestionsOnce(projectPath)
      .then((result) => {
        if (requestSequenceRef.current !== requestSequence) return;
        if (!result.ok) {
          setState("error");
          setErrorMessage(result.error.message);
          setToast({ kind: "error", message: result.error.message });
          return;
        }
        setSuggestions(result.suggestions);
        setState("ready");
      })
      .catch((error) => {
        if (requestSequenceRef.current !== requestSequence) return;
        const message = error instanceof Error ? error.message : "Unable to generate ticket suggestions.";
        setState("error");
        setErrorMessage(message);
        setToast({ kind: "error", message });
      });
  }, [projectPath, setToast]);

  useEffect(() => {
    startGeneration();
  }, [startGeneration]);

  const createSuggestion = async (index: number): Promise<void> => {
    const suggestion = suggestions[index];
    if (!suggestion) return;

    setCreateStates((current) => ({ ...current, [index]: "creating" }));
    setCreateErrors((current) => ({ ...current, [index]: undefined }));
    try {
      const result = await getRelayApi().ticket.createDraft({
        projectPath,
        idea: suggestion.request,
        preferredTicketType: "task"
      });
      if (!result.ok) {
        setCreateStates((current) => ({ ...current, [index]: "idle" }));
        setCreateErrors((current) => ({ ...current, [index]: result.error.message }));
        setToast({ kind: "error", message: result.error.message });
        return;
      }

      setCreateStates((current) => ({ ...current, [index]: "created" }));
      setToast({ kind: "info", message: `Codex draft started for ${result.ticket.frontMatter.title}.` });
      try {
        await onCreated();
      } catch (error) {
        setToast({ kind: "error", message: error instanceof Error ? error.message : "Unable to refresh board." });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create a draft from this suggestion.";
      setCreateStates((current) => ({ ...current, [index]: "idle" }));
      setCreateErrors((current) => ({ ...current, [index]: message }));
      setToast({ kind: "error", message });
    }
  };

  return (
    <div className="modal-backdrop">
      <section className="modal ticket-suggestions-modal" role="dialog" aria-modal="true" aria-labelledby="ticket-suggestions-title">
        <header>
          <div>
            <h2 id="ticket-suggestions-title">Generate Tickets</h2>
            <p>Codex suggests task-sized drafts from the local project and current board.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close generated ticket suggestions dialog">
            <X size={18} />
          </button>
        </header>

        <TicketSuggestionsModalContent
          state={state}
          suggestions={suggestions}
          errorMessage={errorMessage}
          createStates={createStates}
          createErrors={createErrors}
          onCreate={(index) => void createSuggestion(index)}
          onRetry={startGeneration}
        />

        <div className="modal-footer">
          <button onClick={onClose}>Close</button>
        </div>
      </section>
    </div>
  );
}

function CreateTicketModal({
  projectPath,
  onClose,
  onCreated,
  setToast
}: {
  projectPath: string;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
  setToast: (toast: Toast) => void;
}): ReactElement {
  const [idea, setIdea] = useState("");
  const [ticketType, setTicketType] = useState<TicketType>("task");
  const [manualTitle, setManualTitle] = useState("");
  const [manualPriority, setManualPriority] = useState<TicketPriority>("medium");
  const [manualLabels, setManualLabels] = useState("");
  const [draft, setDraft] = useState<TicketDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  const [draftMessageKind, setDraftMessageKind] = useState<"info" | "error">("info");
  const [draftFailure, setDraftFailure] = useState<TicketDraftErrorPayload | null>(null);
  const [draftProgress, setDraftProgress] = useState<LocalAgentProgress | null>(null);
  const [ticketReferences, setTicketReferences] = useState<TicketReferenceCandidate[]>([]);
  const [ticketReferencesLoading, setTicketReferencesLoading] = useState(false);
  const [ticketReferencesError, setTicketReferencesError] = useState<string | null>(null);
  const [ticketReferenceMention, setTicketReferenceMention] = useState<ActiveTicketReferenceMention | null>(null);
  const [ticketReferenceMenuStyle, setTicketReferenceMenuStyle] = useState<CSSProperties | null>(null);
  const [activeTicketReferenceIndex, setActiveTicketReferenceIndex] = useState(0);
  const draftRequestRef = useRef(0);
  const modalRef = useRef<HTMLElement | null>(null);
  const modalFooterRef = useRef<HTMLDivElement | null>(null);
  const ideaEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const draftMarkdown = useMemo(() => (draft ? markdownFromDraft(draft) : ""), [draft]);
  const effectiveTicketType = draft?.ticketType ?? ticketType;
  const dialogTitle = draft?.title.trim() || "Create Ticket";
  const dialogSubtext = draft ? ticketDraftDialogSubtext(draft) : "Draft a clear implementation ticket from a rough idea.";
  const hasUnsavedInput = useMemo(
    () =>
      busy ||
      saving ||
      draft !== null ||
      idea.trim().length > 0 ||
      manualTitle.trim().length > 0 ||
      manualLabels.trim().length > 0 ||
      ticketType !== "task" ||
      manualPriority !== "medium",
    [busy, draft, idea, manualLabels, manualPriority, manualTitle, saving, ticketType]
  );
  const filteredTicketReferences = useMemo(
    () => filterTicketReferenceCandidates(ticketReferences, ticketReferenceMention?.token.query ?? ""),
    [ticketReferenceMention?.token.query, ticketReferences]
  );
  const ideaTicketReferenceMenuOpen = ticketReferenceMention !== null;

  useShortcutOverlay({
    id: "create-ticket-modal",
    priority: 100,
    onEscape: () => {
      if (hasUnsavedInput) {
        setToast({ kind: "info", message: "Create ticket has unsaved input. Use Cancel to discard it or Create Ticket to keep it." });
        return true;
      }
      onClose();
      return true;
    }
  });

  useEffect(() => {
    let active = true;
    setTicketReferencesLoading(true);
    setTicketReferencesError(null);
    void getRelayApi().ticket
      .references(projectPath)
      .then((candidates) => {
        if (!active) return;
        setTicketReferences(candidates);
      })
      .catch((error) => {
        if (!active) return;
        setTicketReferences([]);
        setTicketReferencesError(error instanceof Error ? error.message : "Unable to load ticket references.");
      })
      .finally(() => {
        if (active) setTicketReferencesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [projectPath]);

  useEffect(() => {
    setActiveTicketReferenceIndex((current) => {
      if (filteredTicketReferences.length === 0) return 0;
      return Math.min(current, filteredTicketReferences.length - 1);
    });
  }, [filteredTicketReferences.length]);

  const updateTicketReferenceMention = (value: string, selectionStart: number, selectionEnd = selectionStart): void => {
    const token = getActiveTicketMention(value, selectionStart, selectionEnd);
    setTicketReferenceMention(token ? { token } : null);
    setActiveTicketReferenceIndex(0);
  };

  const updateTicketReferenceMenuPosition = useCallback((): void => {
    if (!ticketReferenceMention || !ideaEditorRef.current) {
      setTicketReferenceMenuStyle(null);
      return;
    }

    const anchorRect = ideaEditorRef.current.getBoundingClientRect();
    const footerTop = modalFooterRef.current?.getBoundingClientRect().top ?? null;
    setTicketReferenceMenuStyle(
      getTicketReferenceMenuLayout({
        anchorRect,
        footerTop,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      }).style
    );
  }, [ticketReferenceMention]);

  useEffect(() => {
    if (!ticketReferenceMention) {
      setTicketReferenceMenuStyle(null);
      return;
    }

    updateTicketReferenceMenuPosition();
    const handleReposition = (): void => updateTicketReferenceMenuPosition();
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);

    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [
    draft,
    draftMessage,
    draftProgress,
    filteredTicketReferences.length,
    ticketReferenceMention,
    ticketReferencesError,
    ticketReferencesLoading,
    updateTicketReferenceMenuPosition
  ]);

  const closeTicketReferenceMenu = (): void => {
    setTicketReferenceMention(null);
    setTicketReferenceMenuStyle(null);
  };

  const insertTicketReference = (candidate: TicketReferenceCandidate): void => {
    const editor = ideaEditorRef.current;
    const currentMention =
      ticketReferenceMention?.token ?? (editor ? getActiveTicketMention(idea, editor.selectionStart, editor.selectionEnd) : null);
    if (!currentMention) return;

    const next = replaceTicketMention(idea, currentMention, candidate);
    setIdea(next.value);
    setTicketReferenceMention(null);
    setTicketReferenceMenuStyle(null);
    window.requestAnimationFrame(() => {
      editor?.focus();
      editor?.setSelectionRange(next.cursor, next.cursor);
    });
  };

  const handleTicketReferenceKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (!ticketReferenceMention) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setTicketReferenceMention(null);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveTicketReferenceIndex((current) =>
        filteredTicketReferences.length === 0 ? 0 : (current + 1) % filteredTicketReferences.length
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveTicketReferenceIndex((current) =>
        filteredTicketReferences.length === 0 ? 0 : (current - 1 + filteredTicketReferences.length) % filteredTicketReferences.length
      );
      return;
    }

    if ((event.key === "Enter" || event.key === "Tab") && filteredTicketReferences.length > 0) {
      event.preventDefault();
      insertTicketReference(filteredTicketReferences[activeTicketReferenceIndex] ?? filteredTicketReferences[0]);
    }
  };

  const renderTicketReferenceMenu = (menuId: string): ReactElement | null => {
    if (!ticketReferenceMention || !ticketReferenceMenuStyle || typeof document === "undefined") return null;

    const portalTarget = modalRef.current?.parentElement ?? document.body;
    return createPortal(
      <div
        className="ticket-reference-menu floating"
        id={menuId}
        role="listbox"
        aria-label="Ticket references"
        style={ticketReferenceMenuStyle}
      >
        {ticketReferencesLoading && <div className="ticket-reference-empty">Loading local tickets...</div>}
        {!ticketReferencesLoading && ticketReferencesError && <div className="ticket-reference-empty">{ticketReferencesError}</div>}
        {!ticketReferencesLoading && !ticketReferencesError && filteredTicketReferences.length === 0 && (
          <div className="ticket-reference-empty">
            {ticketReferences.length === 0 ? "No tickets in this project." : "No matching tickets."}
          </div>
        )}
        {!ticketReferencesLoading &&
          !ticketReferencesError &&
          filteredTicketReferences.map((candidate, index) => (
            <button
              key={candidate.id}
              type="button"
              className={clsx("ticket-reference-option", index === activeTicketReferenceIndex && "active")}
              role="option"
              aria-selected={index === activeTicketReferenceIndex}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveTicketReferenceIndex(index)}
              onClick={() => insertTicketReference(candidate)}
            >
              <strong>{candidate.title}</strong>
              <span>{candidate.relativePath}</span>
              <em>{candidate.columnName}</em>
            </button>
          ))}
      </div>,
      portalTarget
    );
  };

  const draftTicket = async (): Promise<void> => {
    const requestSequence = draftRequestRef.current + 1;
    draftRequestRef.current = requestSequence;
    const ideaSnapshot = idea;
    let accepted = false;
    setBusy(true);
    setDraft(null);
    setDraftFailure(null);
    setDraftProgress(null);
    setDraftMessageKind("info");
    setDraftMessage("Creating a pending ticket and starting Codex in the background.");
    try {
      const result = await getRelayApi().ticket.createDraft({ projectPath, idea: ideaSnapshot, preferredTicketType: ticketType });
      if (draftRequestRef.current !== requestSequence) return;
      if (!result.ok) {
        setDraftFailure(result.error);
        setToast({ kind: "error", message: result.error.message });
        setDraftMessageKind("error");
        setDraftMessage(result.error.message);
        return;
      }
      accepted = true;
      setBusy(false);
      setTicketReferenceMention(null);
      setDraftFailure(null);
      setToast({ kind: "info", message: `Codex draft started for ${result.ticket.frontMatter.title}.` });
      onClose();
      void Promise.resolve(onCreated()).catch((error) => {
        setToast({ kind: "error", message: error instanceof Error ? error.message : "Unable to refresh board." });
      });
    } catch (error) {
      if (draftRequestRef.current !== requestSequence) return;
      const message = error instanceof Error ? error.message : "Ticket drafting failed.";
      setToast({ kind: "error", message });
      setDraftFailure(null);
      setDraftMessageKind("error");
      setDraftMessage(message);
    } finally {
      if (!accepted && draftRequestRef.current === requestSequence) setBusy(false);
    }
  };

  const updateDraftText = (field: "title" | "context", value: string): void => {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
  };

  const updateDraftPriority = (value: TicketPriority): void => {
    setDraft((current) => (current ? { ...current, priority: value } : current));
  };

  const updateDraftArrayField = (field: DraftArrayField, value: string[]): void => {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
  };

  const updateSubticket = (index: number, patch: Partial<TicketDraftSubticket>): void => {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        subtickets: current.subtickets.map((subticket, subticketIndex) =>
          subticketIndex === index ? { ...subticket, ...patch } : subticket
        )
      };
    });
  };

  const renderPlanListField = (
    label: string,
    value: string[] | undefined,
    onChange: (value: string[]) => void,
    placeholder: string
  ): ReactElement => (
    <label className="field">
      <span>{label}</span>
      <textarea className="draft-plan-textarea" value={linesToInput(value ?? [])} placeholder={placeholder} onChange={(event) => onChange(linesFromInput(event.target.value))} />
    </label>
  );

  const save = async (): Promise<void> => {
    const title = draft?.title.trim() || manualTitle.trim();
    if (!title) {
      setToast({ kind: "error", message: "Enter a title before creating the ticket." });
      return;
    }
    setSaving(true);
    try {
      const manualMarkdown = `# ${title}

${idea.trim() || "No additional details provided."}
`;
      await getRelayApi().ticket.createManual(
        projectPath,
        draft
          ? {
              title: draft.title,
              priority: draft.priority,
              labels: draft.labels,
              markdown: draftMarkdown,
              ticketType: draft.ticketType,
              subtickets:
                draft.ticketType === "epic"
                  ? draft.subtickets.map((subticket) => ({
                      title: subticket.title,
                      priority: subticket.priority,
                      labels: subticket.labels,
                      markdown: markdownFromSubticketDraft(subticket, draft.title)
                    }))
                  : []
            }
          : {
              title,
              priority: manualPriority,
              labels: labelsFromInput(manualLabels),
              markdown: manualMarkdown,
              ticketType
            }
      );
      setToast({ kind: "success", message: effectiveTicketType === "epic" ? "Epic created." : "Ticket created." });
      onCreated();
      onClose();
    } catch (error) {
      setToast({ kind: "error", message: error instanceof Error ? error.message : "Unable to create ticket." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <section
        className="modal create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-ticket-title"
        ref={modalRef}
      >
        <header>
          <div>
            <h2 id="create-ticket-title">{dialogTitle}</h2>
            <p>{dialogSubtext}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close create ticket dialog">
            <X size={18} />
          </button>
        </header>

        <div className="create-fields">
          <div className="two-fields create-type-fields">
            <label className="field">
              <span>Type</span>
              <select
                value={ticketType}
                onChange={(event) => {
                  setTicketType(event.target.value as TicketType);
                  setDraft(null);
                  setDraftFailure(null);
                  setDraftMessage(null);
                }}
              >
                {ticketTypeOptions.map((option) => (
                  <option value={option} key={option}>
                    {ticketTypeLabel(option)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Priority</span>
              <select value={manualPriority} onChange={(event) => setManualPriority(event.target.value as TicketPriority)} disabled={Boolean(draft)}>
                {priorityOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Title</span>
            <input
              value={manualTitle}
              onChange={(event) => setManualTitle(event.target.value)}
              placeholder={ticketType === "epic" ? "Epic title" : "Ticket title"}
              disabled={Boolean(draft)}
            />
          </label>
          <label className="field">
            <span>Labels</span>
            <input value={manualLabels} onChange={(event) => setManualLabels(event.target.value)} placeholder="frontend, auth" disabled={Boolean(draft)} />
          </label>
        </div>

        <div className="modal-grid">
          <label className="field">
            <span>{draft ? "Original Idea" : "Details"}</span>
            <div className="ticket-reference-editor idea-reference-editor">
              <textarea
                ref={ideaEditorRef}
                value={idea}
                placeholder={ticketType === "epic" ? "Describe the larger outcome and key subtasks..." : "Describe what you want built..."}
                aria-autocomplete="list"
                aria-controls="idea-ticket-reference-menu"
                aria-expanded={ideaTicketReferenceMenuOpen}
                onChange={(event) => {
                  setIdea(event.target.value);
                  updateTicketReferenceMention(event.target.value, event.target.selectionStart, event.target.selectionEnd);
                }}
                onFocus={(event) =>
                  updateTicketReferenceMention(event.currentTarget.value, event.currentTarget.selectionStart, event.currentTarget.selectionEnd)
                }
                onSelect={(event) =>
                  updateTicketReferenceMention(event.currentTarget.value, event.currentTarget.selectionStart, event.currentTarget.selectionEnd)
                }
                onKeyDown={handleTicketReferenceKeyDown}
                onBlur={() => {
                  window.setTimeout(closeTicketReferenceMenu, 120);
                }}
              />
              {renderTicketReferenceMenu("idea-ticket-reference-menu")}
            </div>
          </label>
          <div className="draft-actions">
            <button className="primary-button" onClick={draftTicket} disabled={busy || idea.trim().length === 0}>
              {busy ? <Loader2 className="spin" size={16} /> : draftFailure?.recoverable ? <RefreshCw size={16} /> : <Code2 size={16} />}
              {busy ? "Starting..." : draftFailure?.recoverable ? "Retry Codex" : "Draft with Codex"}
            </button>
          </div>
        </div>

        {draftMessage && (
          <div className={clsx("draft-message", draftMessageKind)}>
            {busy && <Loader2 className="spin" size={15} />}
            <span>{draftMessage}</span>
          </div>
        )}

        {draftProgress && (
          <AgentProgressSummary
            events={[]}
            status={draftProgress.status}
            startedAt={draftProgress.startedAt}
            endedAt={draftProgress.endedAt}
            metricsAvailable={false}
          />
        )}

        {draft && (
          <div className="editor-stack">
            <div className="draft-meta" aria-label="Generated ticket metadata">
              <span className={clsx("ticket-type-pill", draft.ticketType === "epic" ? "epic" : "task")}>{ticketTypeLabel(draft.ticketType)}</span>
              <span className="priority">{draft.priority}</span>
              {draft.labels.length > 0 && (
                <div className="labels">
                  {draft.labels.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="draft-plan-editor" aria-label="Editable generated ticket plan">
              <label className="field">
                <span>Plan Title</span>
                <input value={draft.title} onChange={(event) => updateDraftText("title", event.target.value)} />
              </label>
              <div className="two-fields">
                <label className="field">
                  <span>Priority</span>
                  <select value={draft.priority} onChange={(event) => updateDraftPriority(event.target.value as TicketPriority)}>
                    {priorityOptions.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Labels</span>
                  <input value={draft.labels.join(", ")} onChange={(event) => updateDraftArrayField("labels", labelsFromInput(event.target.value))} />
                </label>
              </div>
              <label className="field">
                <span>Context</span>
                <textarea className="draft-plan-textarea" value={draft.context} onChange={(event) => updateDraftText("context", event.target.value)} />
              </label>
              {renderPlanListField("Codebase Findings", draft.researchFindings, (value) => updateDraftArrayField("researchFindings", value), "One finding per line")}
              {renderPlanListField("Requirements", draft.requirements, (value) => updateDraftArrayField("requirements", value), "One requirement per line")}
              {renderPlanListField(
                "Implementation Plan",
                draft.implementationPlan,
                (value) => updateDraftArrayField("implementationPlan", value),
                "One implementation step per line"
              )}
              {renderPlanListField("Test Plan", draft.testPlan, (value) => updateDraftArrayField("testPlan", value), "One test command or scenario per line")}
              {renderPlanListField(
                "Acceptance Criteria",
                draft.acceptanceCriteria,
                (value) => updateDraftArrayField("acceptanceCriteria", value),
                "One acceptance criterion per line"
              )}
              {renderPlanListField("Assumptions", draft.assumptions, (value) => updateDraftArrayField("assumptions", value), "One assumption per line")}
              {renderPlanListField(
                "Open Questions",
                draft.clarificationQuestions,
                (value) => updateDraftArrayField("clarificationQuestions", value),
                "One question per line"
              )}
              {renderPlanListField(
                "Implementation Notes",
                draft.implementationNotes,
                (value) => updateDraftArrayField("implementationNotes", value),
                "One note per line"
              )}
            </div>
            <MarkdownBlock
              className="ticket-markdown-preview"
              source={draftMarkdown}
              title="Plan Preview"
              onCopied={(kind) => setToast(copyToast(kind))}
              onCopyError={(error) => setToast({ kind: "error", message: error instanceof Error ? error.message : "Unable to copy." })}
            />
            {draft.ticketType === "epic" && (
              <div className="draft-subtickets" aria-label="Generated subtickets">
                <h3>Generated Subtickets</h3>
                {draft.subtickets.length === 0 ? (
                  <p>No subtickets generated.</p>
                ) : (
                  draft.subtickets.map((subticket: TicketDraftSubticket, index) => (
                    <div className="draft-subticket" key={`${subticket.title}-${index}`}>
                      <label className="field">
                        <span>Subticket Title</span>
                        <input value={subticket.title} onChange={(event) => updateSubticket(index, { title: event.target.value })} />
                      </label>
                      <div className="two-fields">
                        <label className="field">
                          <span>Priority</span>
                          <select
                            value={subticket.priority}
                            onChange={(event) => updateSubticket(index, { priority: event.target.value as TicketPriority })}
                          >
                            {priorityOptions.map((option) => (
                              <option key={option}>{option}</option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Labels</span>
                          <input
                            value={subticket.labels.join(", ")}
                            onChange={(event) => updateSubticket(index, { labels: labelsFromInput(event.target.value) })}
                          />
                        </label>
                      </div>
                      <label className="field">
                        <span>Context</span>
                        <textarea
                          className="draft-plan-textarea"
                          value={subticket.context}
                          onChange={(event) => updateSubticket(index, { context: event.target.value })}
                        />
                      </label>
                      {renderPlanListField("Codebase Findings", subticket.researchFindings, (value) => updateSubticket(index, { researchFindings: value }), "One finding per line")}
                      {renderPlanListField("Requirements", subticket.requirements, (value) => updateSubticket(index, { requirements: value }), "One requirement per line")}
                      {renderPlanListField(
                        "Implementation Plan",
                        subticket.implementationPlan,
                        (value) => updateSubticket(index, { implementationPlan: value }),
                        "One implementation step per line"
                      )}
                      {renderPlanListField("Test Plan", subticket.testPlan, (value) => updateSubticket(index, { testPlan: value }), "One test command or scenario per line")}
                      {renderPlanListField(
                        "Acceptance Criteria",
                        subticket.acceptanceCriteria,
                        (value) => updateSubticket(index, { acceptanceCriteria: value }),
                        "One acceptance criterion per line"
                      )}
                      {renderPlanListField("Assumptions", subticket.assumptions, (value) => updateSubticket(index, { assumptions: value }), "One assumption per line")}
                      {renderPlanListField(
                        "Open Questions",
                        subticket.clarificationQuestions,
                        (value) => updateSubticket(index, { clarificationQuestions: value }),
                        "One question per line"
                      )}
                      {renderPlanListField(
                        "Implementation Notes",
                        subticket.implementationNotes,
                        (value) => updateSubticket(index, { implementationNotes: value }),
                        "One note per line"
                      )}
                      <MarkdownBlock
                        className="ticket-markdown-preview compact"
                        source={markdownFromSubticketDraft(subticket, draft.title)}
                        title={`Subticket ${index + 1}`}
                        onCopied={(kind) => setToast(copyToast(kind))}
                        onCopyError={(error) =>
                          setToast({ kind: "error", message: error instanceof Error ? error.message : "Unable to copy." })
                        }
                      />
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        <div className="modal-footer" ref={modalFooterRef}>
          <button onClick={onClose}>Cancel</button>
          <button className="primary-button" onClick={save} disabled={saving || (!draft && manualTitle.trim().length === 0)}>
            {saving ? <Loader2 className="spin" size={16} /> : <Check size={16} />}
            {effectiveTicketType === "epic" ? "Create Epic" : "Create Ticket"}
          </button>
        </div>
      </section>
    </div>
  );
}

function TicketDetail({
  projectPath,
  ticketId,
  board,
  events,
  onClose,
  onOpenTicket,
  onChanged,
  setToast
}: {
  projectPath: string;
  ticketId: string;
  board: BoardSnapshot;
  events: RendererRunEvent[];
  onClose: () => void;
  onOpenTicket: (ticketId: string) => void;
  onChanged: () => void;
  setToast: (toast: Toast) => void;
}): ReactElement {
  const [ticket, setTicket] = useState<TicketRecord | null>(null);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("medium");
  const [status, setStatus] = useState("todo");
  const [labels, setLabels] = useState("");
  const [blockedByIds, setBlockedByIds] = useState<string[]>([]);
  const [markdown, setMarkdown] = useState("");
  const [busy, setBusy] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [clarifications, setClarifications] = useState<ClarificationQuestion[]>([]);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [submittingAnswerId, setSubmittingAnswerId] = useState<string | null>(null);
  const [persistedEvents, setPersistedEvents] = useState<RendererRunEvent[]>([]);
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [logViewerOpen, setLogViewerOpen] = useState(false);
  const [runPreflight, setRunPreflight] = useState<CodexRunPreflightResult | null>(null);
  const [ticketUpdateRequest, setTicketUpdateRequest] = useState("");
  const [ticketUpdateRunId, setTicketUpdateRunId] = useState<string | null>(null);
  const [ticketUpdateStatus, setTicketUpdateStatus] = useState<RunStatus>("idle");
  const [ticketUpdateStartedAt, setTicketUpdateStartedAt] = useState<string | null>(null);
  const [ticketUpdateEndedAt, setTicketUpdateEndedAt] = useState<string | null>(null);
  const [ticketUpdateError, setTicketUpdateError] = useState<string | null>(null);
  const [ticketUpdateCancelling, setTicketUpdateCancelling] = useState(false);
  const [ticketUpdateLogViewerOpen, setTicketUpdateLogViewerOpen] = useState(false);
  const [attachmentDropActive, setAttachmentDropActive] = useState(false);
  const [attachmentDropBusy, setAttachmentDropBusy] = useState(false);
  const [addTicketsOpen, setAddTicketsOpen] = useState(false);
  const [blockerPanelOpen, setBlockerPanelOpen] = useState(false);
  const [newSubticketTitle, setNewSubticketTitle] = useState("");
  const [newSubticketPriority, setNewSubticketPriority] = useState<TicketPriority>("medium");
  const [newSubticketLabels, setNewSubticketLabels] = useState("");
  const [linkSubticketId, setLinkSubticketId] = useState("");
  const [subticketBusy, setSubticketBusy] = useState(false);
  const ticketUpdateInputRef = useRef<HTMLTextAreaElement | null>(null);
  const markdownEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const labelsInputRef = useRef<HTMLInputElement | null>(null);
  const subticketsPanelRef = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    setDetailError(null);
    try {
      const [record, questions] = await Promise.all([
        getRelayApi().ticket.read(projectPath, ticketId),
        getRelayApi().ticket.clarifications(projectPath, ticketId)
      ]);
      setTicket(record);
      setTitle(record.frontMatter.title);
      setPriority(record.frontMatter.priority);
      setStatus(record.frontMatter.status);
      setLabels(record.frontMatter.labels.join(", "));
      setBlockedByIds(record.frontMatter.blockedByIds ?? []);
      setMarkdown(record.markdown);
      setRunId(record.frontMatter.lastRunId);
      setClarifications(questions);
      setAnswerDrafts((current) =>
        Object.fromEntries(questions.filter((question) => !question.answer).map((question) => [question.id, current[question.id] ?? ""]))
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : `Ticket ${ticketId} could not be loaded for ${projectPath}.`;
      setTicket(null);
      setClarifications([]);
      setPersistedEvents([]);
      setRunSummary(null);
      setBlockedByIds([]);
      setDetailError(message);
      setToast({ kind: "error", message });
    }
  }, [projectPath, setToast, ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setTicketUpdateRequest("");
    setTicketUpdateRunId(null);
    setTicketUpdateStatus("idle");
    setTicketUpdateStartedAt(null);
    setTicketUpdateEndedAt(null);
    setTicketUpdateError(null);
    setTicketUpdateCancelling(false);
    setTicketUpdateLogViewerOpen(false);
    setAttachmentDropActive(false);
    setAttachmentDropBusy(false);
    setRunPreflight(null);
    setRunSummary(null);
    setAddTicketsOpen(false);
    setBlockerPanelOpen(false);
    setNewSubticketTitle("");
    setNewSubticketPriority("medium");
    setNewSubticketLabels("");
    setLinkSubticketId("");
    setSubticketBusy(false);
    setBlockedByIds([]);
  }, [projectPath, ticketId]);

  useEffect(() => {
    if (
      events.some(
        (event) =>
          event.ticketId === ticketId &&
          (event.type === "clarification.requested" ||
            event.type === "run.completed" ||
            event.type === "run.failed" ||
            event.type === "ticket.status_changed")
      )
    ) {
      void load();
    }
  }, [events, load, ticketId]);

  useEffect(() => {
    let cancelled = false;
    if (!runId) {
      setPersistedEvents([]);
      setRunSummary(null);
      setLogError(null);
      setLogLoading(false);
      return undefined;
    }

    setLogLoading(true);
    setLogError(null);
    void Promise.all([
      getRelayApi().codex.readRunEvents(projectPath, ticketId, runId),
      getRelayApi().codex.readLatestRunSummary(projectPath, ticketId)
    ])
      .then(([runEvents, summary]) => {
        if (!cancelled) {
          setPersistedEvents(runEvents);
          setRunSummary(summary);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPersistedEvents([]);
          setRunSummary(null);
          setLogError(error instanceof Error ? error.message : "Unknown error");
        }
      })
      .finally(() => {
        if (!cancelled) setLogLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectPath, runId, ticket?.frontMatter.runStatus, ticketId]);

  const currentRunEvents = useMemo(() => {
    const liveRunEvents = runId ? events.filter((event) => event.runId === runId) : [];
    return mergeRunEvents(persistedEvents, liveRunEvents);
  }, [events, persistedEvents, runId]);
  const draftInProgress = ticket?.frontMatter.runStatus === "drafting";
  const draftFailed = ticket?.frontMatter.runStatus === "draft_failed";
  const draftFailureMessage = useMemo(
    () => [...currentRunEvents].reverse().find((event) => event.type === "run.failed")?.message ?? "Codex ticket drafting failed.",
    [currentRunEvents]
  );
  const ticketUpdateEvents = useMemo(
    () => (ticketUpdateRunId ? events.filter((event) => event.runId === ticketUpdateRunId) : []),
    [events, ticketUpdateRunId]
  );
  const ticketUpdateActive = isAgentSessionActive(ticketUpdateStatus) || ticketUpdateCancelling;
  const runQueued = ticket?.frontMatter.runStatus === "queued";
  const linkedSubtickets = useMemo(() => {
    if (!ticket || ticket.frontMatter.ticketType !== "epic") return [];
    const byId = new Map(board.tickets.map((item) => [item.id, item]));
    const ordered = ticket.frontMatter.subticketIds.map((id) => byId.get(id)).filter((item): item is TicketSummary => Boolean(item));
    const derived = board.tickets.filter(
      (item) => item.parentEpicId === ticket.frontMatter.id && !ticket.frontMatter.subticketIds.includes(item.id)
    );
    return [...ordered, ...derived].sort((a, b) => {
      const aIndex = ticket.frontMatter.subticketIds.indexOf(a.id);
      const bIndex = ticket.frontMatter.subticketIds.indexOf(b.id);
      if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
      if (aIndex >= 0) return -1;
      if (bIndex >= 0) return 1;
      return a.position - b.position;
    });
  }, [board.tickets, ticket]);
  const parentEpic = useMemo(
    () => (ticket?.frontMatter.parentEpicId ? board.tickets.find((item) => item.id === ticket.frontMatter.parentEpicId) ?? null : null),
    [board.tickets, ticket?.frontMatter.parentEpicId]
  );
  const parentEpicBlockers = useMemo(
    () => (parentEpic ? resolveTicketBlockers(parentEpic, board.tickets, board.columns) : null),
    [board.columns, board.tickets, parentEpic]
  );
  const blockerResolution = useMemo(
    () => (ticket ? resolveTicketBlockers({ id: ticket.frontMatter.id, blockedByIds }, board.tickets, board.columns) : null),
    [blockedByIds, board.columns, board.tickets, ticket]
  );
  const blockerCandidates = useMemo(() => {
    if (!ticket) return [];
    return board.tickets
      .filter((item) => item.id !== ticket.frontMatter.id)
      .sort((a, b) => ticketBlockerOptionLabel(a, board.tickets, board.columns).localeCompare(ticketBlockerOptionLabel(b, board.tickets, board.columns)));
  }, [board.columns, board.tickets, ticket]);
  const blockerCount = blockedByIds.length;
  const labelCount = useMemo(() => labelsFromInput(labels).length, [labels]);
  const linkableTickets = useMemo(() => {
    if (!ticket || ticket.frontMatter.ticketType !== "epic") return [];
    const linkedIds = new Set(linkedSubtickets.map((item) => item.id));
    return board.tickets
      .filter((item) => item.id !== ticket.frontMatter.id && item.ticketType === "task" && !linkedIds.has(item.id))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [board.tickets, linkedSubtickets, ticket]);
  const unansweredClarificationCount = useMemo(
    () => clarifications.filter((question) => !question.answer?.trim()).length,
    [clarifications]
  );
  const reviewStatusAvailable = board.columns.some((column) => column.id === "review");
  const completedStatusAvailable = board.columns.some((column) => column.id === "completed");
  const todoStatusAvailable = board.columns.some((column) => column.id === "todo");

  useEffect(() => {
    if (!ticketUpdateRunId || ticketUpdateEndedAt) return;
    const terminalEvent = [...ticketUpdateEvents]
      .reverse()
      .find((event) => event.type === "run.completed" || event.type === "run.failed");
    if (!terminalEvent) return;

    setTicketUpdateEndedAt(terminalEvent.timestamp);
    setTicketUpdateCancelling(false);
    if (terminalEvent.type === "run.completed") {
      setTicketUpdateStatus("completed");
      setTicketUpdateError(null);
      setTicketUpdateRequest("");
      setToast({ kind: "success", message: "Ticket updated by agent." });
      onChanged();
      void load();
      return;
    }

    if (ticketUpdateStatus === "cancelled" || /cancelled/i.test(terminalEvent.message)) {
      setTicketUpdateStatus("cancelled");
      setTicketUpdateError(null);
      setToast({ kind: "info", message: "Ticket update cancelled." });
      return;
    }

    setTicketUpdateStatus("failed");
    setTicketUpdateError(terminalEvent.message || "Ticket update failed.");
    setToast({ kind: "error", message: terminalEvent.message || "Ticket update failed." });
  }, [load, onChanged, setToast, ticketUpdateEndedAt, ticketUpdateEvents, ticketUpdateRunId, ticketUpdateStatus]);

  const hasUnsavedChanges = useMemo(() => {
    if (!ticket) return Boolean(busy || submittingAnswerId || ticketUpdateActive || ticketUpdateRequest.trim());
    return (
      busy ||
      attachmentDropBusy ||
      subticketBusy ||
      Boolean(submittingAnswerId) ||
      ticketUpdateActive ||
      ticketUpdateRequest.trim().length > 0 ||
      newSubticketTitle.trim().length > 0 ||
      newSubticketLabels.trim().length > 0 ||
      linkSubticketId.length > 0 ||
      title !== ticket.frontMatter.title ||
      priority !== ticket.frontMatter.priority ||
      status !== ticket.frontMatter.status ||
      labels !== ticket.frontMatter.labels.join(", ") ||
      !sameStringArray(blockedByIds, ticket.frontMatter.blockedByIds ?? []) ||
      markdown !== ticket.markdown ||
      Object.values(answerDrafts).some((answer) => answer.trim().length > 0)
    );
  }, [
    answerDrafts,
    attachmentDropBusy,
    blockedByIds,
    busy,
    labels,
    linkSubticketId,
    markdown,
    newSubticketLabels,
    newSubticketTitle,
    priority,
    status,
    submittingAnswerId,
    subticketBusy,
    ticket,
    ticketUpdateActive,
    ticketUpdateRequest,
    title
  ]);

  useShortcutOverlay({
    id: `ticket-detail:${ticketId}`,
    priority: 20,
    onEscape: () => {
      if (hasUnsavedChanges) {
        setToast({ kind: "info", message: "Ticket detail has unsaved input. Save it or use the close button to discard changes." });
        return true;
      }
      onClose();
      return true;
    }
  });

  const droppedFiles = (event: DragEvent<HTMLTextAreaElement>): File[] => Array.from(event.dataTransfer.files);

  const handleMarkdownDragOver = (event: DragEvent<HTMLTextAreaElement>): void => {
    if (draftInProgress || attachmentDropBusy) return;
    const items = Array.from(event.dataTransfer.items).filter((item) => item.kind === "file");
    if (items.length === 0) return;

    const allImages = items.every((item) => item.type === "" || item.type.startsWith("image/"));
    if (!allImages) {
      event.dataTransfer.dropEffect = "none";
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setAttachmentDropActive(true);
  };

  const handleMarkdownDragLeave = (event: DragEvent<HTMLTextAreaElement>): void => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    setAttachmentDropActive(false);
  };

  const handleMarkdownDrop = async (event: DragEvent<HTMLTextAreaElement>): Promise<void> => {
    if (draftInProgress || attachmentDropBusy) return;
    const files = droppedFiles(event);
    if (files.length === 0) return;

    event.preventDefault();
    setAttachmentDropActive(false);
    if (files.some((file) => !isSupportedDroppedImageFile(file))) {
      setToast({ kind: "error", message: "Only image files can be dropped into ticket markdown." });
      return;
    }

    const editor = event.currentTarget;
    const selectionStart = editor.selectionStart;
    const selectionEnd = editor.selectionEnd;
    setAttachmentDropBusy(true);
    try {
      const attachments: TicketAttachmentSaveResult[] = [];
      for (const file of files) {
        attachments.push(await getRelayApi().ticket.saveAttachment(await droppedImageFileToAttachmentInput(projectPath, file)));
      }
      const inserted = insertMarkdownAtSelection(markdown, attachmentMarkdownBlock(attachments), selectionStart, selectionEnd);
      setMarkdown(inserted.value);
      window.requestAnimationFrame(() => {
        markdownEditorRef.current?.focus();
        markdownEditorRef.current?.setSelectionRange(inserted.cursor, inserted.cursor);
      });
      setToast({
        kind: "success",
        message: attachments.length === 1 ? "Image attached to ticket markdown." : `${attachments.length} images attached to ticket markdown.`
      });
    } catch (error) {
      setToast({ kind: "error", message: error instanceof Error ? error.message : "Unable to save dropped image." });
    } finally {
      setAttachmentDropBusy(false);
    }
  };

  const save = async (): Promise<void> => {
    if (!ticket) return;
    if (draftInProgress) {
      setToast({ kind: "info", message: "Wait for Codex to finish drafting before editing this ticket." });
      return;
    }
    if (blockerResolution && blockerResolution.selfBlockerIds.length > 0) {
      setToast({ kind: "error", message: "Remove the self blocker before saving this ticket." });
      return;
    }
    setBusy(true);
    try {
      await getRelayApi().ticket.save({
        projectPath,
        ticket: {
          ...ticket,
          markdown,
          frontMatter: {
            ...ticket.frontMatter,
            title,
            priority,
            status,
            labels: labelsFromInput(labels),
            blockedByIds
          }
        }
      });
      setToast({ kind: "success", message: "Ticket saved." });
      onChanged();
      await load();
    } finally {
      setBusy(false);
    }
  };

  const startTicketUpdate = async (): Promise<void> => {
    if (!ticket || ticketUpdateActive || draftInProgress) return;
    const request = ticketUpdateRequest.trim();
    if (!request) {
      setTicketUpdateError("Enter a change request before starting the ticket update agent.");
      return;
    }

    const startedAt = new Date().toISOString();
    setTicketUpdateStatus("running");
    setTicketUpdateStartedAt(startedAt);
    setTicketUpdateEndedAt(null);
    setTicketUpdateError(null);
    setTicketUpdateCancelling(false);
    try {
      const result = await getRelayApi().ticket.startAgentUpdate({ projectPath, ticketId, request });
      setTicketUpdateRunId(result.runId);
      setToast({ kind: "info", message: `Ticket update agent started: ${result.runId}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ticket update agent failed to start.";
      setTicketUpdateStatus("failed");
      setTicketUpdateEndedAt(new Date().toISOString());
      setTicketUpdateError(message);
      setToast({ kind: "error", message });
    }
  };

  const cancelTicketUpdate = async (): Promise<void> => {
    if (!ticketUpdateRunId || !ticketUpdateActive) return;
    setTicketUpdateStatus("cancelled");
    setTicketUpdateCancelling(true);
    try {
      await getRelayApi().ticket.cancelAgentUpdate(ticketUpdateRunId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to cancel ticket update.";
      setTicketUpdateStatus("running");
      setTicketUpdateCancelling(false);
      setTicketUpdateError(message);
      setToast({ kind: "error", message });
    }
  };

  const startRun = async (resume: boolean, freshThread = false): Promise<void> => {
    if (draftInProgress) {
      setToast({ kind: "info", message: "Wait for Codex to finish drafting before starting a run." });
      return;
    }
    setBusy(true);
    try {
      setRunPreflight(null);
      const preflight = await getRelayApi().codex.preflightRun({ projectPath, ticketId, freshThread });
      setRunPreflight(preflight);
      if (!preflight.ok) {
        setToast({ kind: "error", message: preflight.errors[0] ?? "Codex run is blocked." });
        return;
      }
      const result = resume
        ? await getRelayApi().codex.resumeRun({ projectPath, ticketId, freshThread })
        : await getRelayApi().codex.startRun({ projectPath, ticketId, freshThread });
      setRunId(result.runId);
      setToast({
        kind: "info",
        message: result.state === "queued" ? `Codex run queued: ${result.runId}` : `Codex run started: ${result.runId}`
      });
      onChanged();
      await load();
    } catch (error) {
      setToast({ kind: "error", message: error instanceof Error ? error.message : "Codex run failed to start." });
    } finally {
      setBusy(false);
    }
  };

  const moveTicketTo = async (targetStatus: string, successMessage: string): Promise<void> => {
    if (!ticket) return;
    setBusy(true);
    try {
      await getRelayApi().ticket.move({ projectPath, ticketId, targetStatus });
      setToast({ kind: "success", message: successMessage });
      onChanged();
      await load();
    } catch (error) {
      setToast({ kind: "error", message: error instanceof Error ? error.message : "Unable to update ticket status." });
    } finally {
      setBusy(false);
    }
  };

  const requestChanges = (): void => {
    const prefix = "Address review feedback: ";
    setTicketUpdateRequest((current) => (current.trim().length > 0 ? current : prefix));
    setTicketUpdateError(null);
    window.requestAnimationFrame(() => {
      ticketUpdateInputRef.current?.focus();
      const cursor = ticketUpdateInputRef.current?.value.length ?? 0;
      ticketUpdateInputRef.current?.setSelectionRange(cursor, cursor);
    });
  };

  const focusLabelsInput = (): void => {
    labelsInputRef.current?.scrollIntoView({ block: "center" });
    window.requestAnimationFrame(() => labelsInputRef.current?.focus());
  };

  const toggleSubticketPanel = (): void => {
    const nextOpen = !addTicketsOpen;
    setAddTicketsOpen(nextOpen);
    if (nextOpen) {
      window.requestAnimationFrame(() => subticketsPanelRef.current?.scrollIntoView({ block: "nearest" }));
    }
  };

  const toggleBlocker = (blockerId: string): void => {
    setBlockedByIds((current) =>
      current.includes(blockerId) ? current.filter((candidate) => candidate !== blockerId) : [...current, blockerId]
    );
  };

  const removeBlocker = (blockerId: string): void => {
    setBlockedByIds((current) => current.filter((candidate) => candidate !== blockerId));
  };

  const cancelRun = async (): Promise<void> => {
    if (!runId) return;
    await getRelayApi().codex.cancelRun(runId);
    setToast({ kind: "info", message: "Run cancelled." });
    onChanged();
    await load();
  };

  const submitClarificationAnswer = async (questionId: string): Promise<void> => {
    const answer = answerDrafts[questionId]?.trim();
    if (!answer) return;
    setSubmittingAnswerId(questionId);
    try {
      await getRelayApi().ticket.answerClarification({ projectPath, ticketId, questionId, answer });
      setToast({ kind: "success", message: "Clarification answer saved." });
      onChanged();
      await load();
    } catch (error) {
      setToast({ kind: "error", message: error instanceof Error ? error.message : "Unable to save clarification answer." });
    } finally {
      setSubmittingAnswerId(null);
    }
  };

  const remove = async (): Promise<void> => {
    await getRelayApi().ticket.delete(projectPath, ticketId);
    setToast({ kind: "success", message: "Ticket moved to trash." });
    onChanged();
    onClose();
  };

  const duplicate = async (): Promise<void> => {
    await getRelayApi().ticket.duplicate(projectPath, ticketId);
    setToast({ kind: "success", message: "Ticket duplicated." });
    onChanged();
  };

  const createChildTicket = async (): Promise<void> => {
    if (!ticket || ticket.frontMatter.ticketType !== "epic") return;
    const childTitle = newSubticketTitle.trim();
    if (!childTitle) {
      setToast({ kind: "error", message: "Enter a subticket title." });
      return;
    }
    setSubticketBusy(true);
    try {
      await getRelayApi().ticket.createSubticket({
        projectPath,
        epicId: ticket.frontMatter.id,
        ticket: {
          title: childTitle,
          priority: newSubticketPriority,
          labels: labelsFromInput(newSubticketLabels),
          markdown: manualSubticketMarkdown(childTitle, ticket.frontMatter.title)
        }
      });
      setNewSubticketTitle("");
      setNewSubticketPriority("medium");
      setNewSubticketLabels("");
      setToast({ kind: "success", message: "Subticket added." });
      onChanged();
      await load();
    } catch (error) {
      setToast({ kind: "error", message: error instanceof Error ? error.message : "Unable to add subticket." });
    } finally {
      setSubticketBusy(false);
    }
  };

  const linkExistingTicket = async (): Promise<void> => {
    if (!ticket || ticket.frontMatter.ticketType !== "epic" || !linkSubticketId) return;
    setSubticketBusy(true);
    try {
      await getRelayApi().ticket.linkSubticket({ projectPath, epicId: ticket.frontMatter.id, ticketId: linkSubticketId });
      setLinkSubticketId("");
      setToast({ kind: "success", message: "Ticket linked." });
      onChanged();
      await load();
    } catch (error) {
      setToast({ kind: "error", message: error instanceof Error ? error.message : "Unable to link ticket." });
    } finally {
      setSubticketBusy(false);
    }
  };

  const unlinkChildTicket = async (childId: string): Promise<void> => {
    if (!ticket || ticket.frontMatter.ticketType !== "epic") return;
    setSubticketBusy(true);
    try {
      await getRelayApi().ticket.unlinkSubticket({ projectPath, epicId: ticket.frontMatter.id, ticketId: childId });
      setToast({ kind: "success", message: "Subticket unlinked." });
      onChanged();
      await load();
    } catch (error) {
      setToast({ kind: "error", message: error instanceof Error ? error.message : "Unable to unlink subticket." });
    } finally {
      setSubticketBusy(false);
    }
  };

  if (detailError) {
    return (
      <aside className="detail-panel">
        <header className="detail-header">
          <div>
            <span className="run-pill failed">Missing</span>
            <h2>Ticket unavailable</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close ticket detail">
            <X size={18} />
          </button>
        </header>
        <div className="health error" role="alert">
          <AlertTriangle size={17} />
          <span>{detailError}</span>
        </div>
        <div className="detail-actions">
          <button onClick={() => void load()}>
            <RefreshCw size={16} />
            Retry
          </button>
          <button onClick={onClose}>
            <X size={16} />
            Close
          </button>
        </div>
      </aside>
    );
  }

  if (!ticket) {
    return (
      <aside className="detail-panel">
        <Loader2 className="spin" />
      </aside>
    );
  }

  return (
    <>
      <aside className="detail-panel">
        <header className="detail-header">
          <div>
            <div className="detail-status-row">
              <TicketRunStatusPill status={ticket.frontMatter.runStatus} />
              {blockerResolution?.isBlocked && (
                <span className="ticket-blocker-pill active" title={blockerResolution.activeBlockers.map(resolvedBlockerLabel).join("; ")}>
                  Blocked
                </span>
              )}
            </div>
            <h2>{ticket.frontMatter.title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close ticket detail">
            <X size={18} />
          </button>
        </header>

        <div className="detail-actions">
          <button
            className="primary-button"
            onClick={() => startRun(Boolean(ticket.frontMatter.codexThreadId))}
            disabled={busy || ticketUpdateActive || draftInProgress || runQueued}
          >
            {busy ? <Loader2 className="spin" size={16} /> : <Play size={16} />}
            {ticket.frontMatter.codexThreadId ? "Resume Codex" : "Start Codex"}
          </button>
          {ticket.frontMatter.codexThreadId && (
            <button onClick={() => startRun(false, true)} disabled={busy || ticketUpdateActive || draftInProgress || runQueued}>
              {busy ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
              Start Fresh Thread
            </button>
          )}
          {runId && (ticket.frontMatter.runStatus === "queued" || ticket.frontMatter.runStatus === "running" || draftInProgress) && (
            <button onClick={cancelRun}>
              <X size={16} />
              Stop
            </button>
          )}
          {completedStatusAvailable && ticket.frontMatter.status === "review" && (
            <button onClick={() => void moveTicketTo("completed", "Ticket accepted.")} disabled={busy || ticketUpdateActive || draftInProgress}>
              <Check size={16} />
              Mark Accepted
            </button>
          )}
          {reviewStatusAvailable && ticket.frontMatter.status === "review" && (
            <button onClick={requestChanges} disabled={busy || ticketUpdateActive || draftInProgress}>
              <Send size={16} />
              Request Changes
            </button>
          )}
          {ticket.frontMatter.status === "completed" && todoStatusAvailable && (
            <button onClick={() => void moveTicketTo("todo", "Ticket reopened.")} disabled={busy || ticketUpdateActive || draftInProgress}>
              <RefreshCw size={16} />
              Reopen
            </button>
          )}
          <button onClick={save} disabled={busy || ticketUpdateActive || draftInProgress}>
            <Save size={16} />
            Save
          </button>
        </div>

        <div className="ticket-detail-actions-row" role="group" aria-label="Ticket detail actions">
          <button
            className={clsx("compact-action-button", blockerPanelOpen && "active")}
            onClick={() => setBlockerPanelOpen((open) => !open)}
            disabled={draftInProgress}
            aria-expanded={blockerPanelOpen}
            aria-controls="ticket-blocker-manager"
            aria-label={blockerCount === 0 ? "Add blocker" : `Manage ${blockerCount} blocker${blockerCount === 1 ? "" : "s"}`}
            title={blockerCount === 0 ? "Add blocker" : "Manage blockers"}
          >
            <Plus size={14} />
            <span>Blocker</span>
            {blockerCount > 0 && <span className="compact-action-count">{blockerCount}</span>}
          </button>
          {ticket.frontMatter.ticketType === "epic" && (
            <button
              className={clsx("compact-action-button", addTicketsOpen && "active")}
              onClick={toggleSubticketPanel}
              disabled={subticketBusy || draftInProgress}
              aria-expanded={addTicketsOpen}
              aria-controls="ticket-subtask-manager"
              aria-label={linkedSubtickets.length === 0 ? "Add subtask" : `Manage ${linkedSubtickets.length} subtask${linkedSubtickets.length === 1 ? "" : "s"}`}
              title="Add or link subtasks"
            >
              {subticketBusy ? <Loader2 className="spin" size={14} /> : <Plus size={14} />}
              <span>Subtask</span>
              {linkedSubtickets.length > 0 && <span className="compact-action-count">{linkedSubtickets.length}</span>}
            </button>
          )}
          <button
            className="compact-action-button"
            onClick={focusLabelsInput}
            disabled={draftInProgress}
            aria-label={labelCount === 0 ? "Add tags" : `Edit ${labelCount} tag${labelCount === 1 ? "" : "s"}`}
            title="Edit tags"
          >
            <Plus size={14} />
            <span>Tags</span>
            {labelCount > 0 && <span className="compact-action-count">{labelCount}</span>}
          </button>
        </div>

        {draftInProgress && (
          <div className="ticket-update-error warning" role="status">
            <Loader2 className="spin" size={16} />
            <span>Codex is drafting this ticket. The generated plan will appear here when the background draft run completes.</span>
          </div>
        )}

        {draftFailed && (
          <div className="ticket-update-error" role="alert">
            <AlertTriangle size={16} />
            <span>{draftFailureMessage}</span>
          </div>
        )}

        {draftInProgress ? (
          <DraftingTicketDetailLoading title={ticket.frontMatter.title} />
        ) : (
          <>
            {runPreflight && (!runPreflight.ok || runPreflight.warnings.length > 0) && (
              <div className={clsx("ticket-update-error", runPreflight.ok ? "warning" : "error")} role={runPreflight.ok ? "status" : "alert"}>
                <AlertTriangle size={16} />
                <span>{[...runPreflight.errors, ...runPreflight.warnings].join(" ")}</span>
              </div>
            )}

            {unansweredClarificationCount > 0 && (
              <div className="ticket-update-error" role="alert">
                <AlertTriangle size={16} />
                <span>Answer {unansweredClarificationCount} clarification question(s) before starting or resuming Codex.</span>
              </div>
            )}

        {blockerResolution?.isBlocked && (
          <div className="ticket-update-error warning" role="alert">
            <AlertTriangle size={16} />
            <span>
              Blocked by {blockerResolution.activeBlockers.map(resolvedBlockerLabel).join("; ")}. Move blockers to terminal columns before starting
              Codex.
            </span>
          </div>
        )}

        {blockerResolution && blockerResolution.warnings.length > 0 && (
          <div className="ticket-update-error warning" role="status">
            <AlertTriangle size={16} />
            <span>{blockerResolution.warnings.join(" ")}</span>
          </div>
        )}

        {blockerPanelOpen && (
          <section className="epic-link-panel blocker-panel" id="ticket-blocker-manager">
            <header>
              <div className="blocker-panel-title">
                <h3>Blockers</h3>
                {blockerResolution?.isBlocked && <span className="ticket-blocker-pill active">Blocked</span>}
              </div>
              <button className="icon-button" onClick={() => setBlockerPanelOpen(false)} aria-label="Close blocker manager">
                <X size={15} />
              </button>
            </header>
            <div className="blocker-summary-list">
              {blockedByIds.length === 0 ? (
                <p>No blockers selected.</p>
              ) : (
                <>
                  {blockerResolution?.resolvedBlockers.map((blocker) => (
                    <div className={clsx("blocker-row", blocker.active && "active")} key={blocker.id}>
                      <button className="blocker-main" onClick={() => onOpenTicket(blocker.id)}>
                        <strong>{blocker.title}</strong>
                        <span>{blocker.contextLabel}</span>
                        <em>{blocker.columnName}</em>
                      </button>
                      <button className="icon-button" onClick={() => removeBlocker(blocker.id)} aria-label={`Remove ${blocker.title} blocker`}>
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                  {blockerResolution?.missingBlockerIds.map((blockerId) => (
                    <div className="blocker-row warning" key={blockerId}>
                      <div className="blocker-main static">
                        <strong>{blockerId}</strong>
                        <span>Missing blocker reference</span>
                        <em>Warning</em>
                      </div>
                      <button className="icon-button" onClick={() => removeBlocker(blockerId)} aria-label={`Remove missing blocker ${blockerId}`}>
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                  {blockerResolution?.selfBlockerIds.map((blockerId) => (
                    <div className="blocker-row warning" key={blockerId}>
                      <div className="blocker-main static">
                        <strong>{blockerId}</strong>
                        <span>Self blocker reference</span>
                        <em>Invalid</em>
                      </div>
                      <button className="icon-button" onClick={() => removeBlocker(blockerId)} aria-label="Remove self blocker">
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
            <div className="blocker-picker" role="group" aria-label="Ticket blockers">
              {blockerCandidates.length === 0 ? (
                <p>No other tickets available.</p>
              ) : (
                blockerCandidates.map((candidate) => (
                  <label className={clsx("blocker-option", blockedByIds.includes(candidate.id) && "selected")} key={candidate.id}>
                    <input
                      type="checkbox"
                      checked={blockedByIds.includes(candidate.id)}
                      onChange={() => toggleBlocker(candidate.id)}
                    />
                    <span>
                      <strong>{candidate.title}</strong>
                      <small>{ticketContextLabel(candidate, board.tickets)}</small>
                    </span>
                    <em>{statusName(board.columns, candidate.status)}</em>
                  </label>
                ))
              )}
            </div>
          </section>
        )}

        {parentEpic && (
          <section className="epic-link-panel">
            <header>
              <h3>Parent Epic</h3>
            </header>
            <button className="subticket-row parent" onClick={() => onOpenTicket(parentEpic.id)}>
              <strong>{parentEpic.title}</strong>
              <span>{statusName(board.columns, parentEpic.status)}</span>
              {parentEpicBlockers?.isBlocked && <span className="ticket-blocker-pill active">Blocked</span>}
              {parentEpicBlockers && parentEpicBlockers.warnings.length > 0 && <span className="ticket-blocker-pill warning">Blocker Warning</span>}
              <em className={clsx("priority", parentEpic.priority)}>{parentEpic.priority}</em>
            </button>
          </section>
        )}

        {ticket.frontMatter.ticketType === "epic" && (
          <section className="epic-link-panel" id="ticket-subtask-manager" ref={subticketsPanelRef}>
            <header>
              <h3>Subtickets</h3>
              <button onClick={toggleSubticketPanel} disabled={subticketBusy}>
                {subticketBusy ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
                Add Tickets
              </button>
            </header>
            <div className="subticket-list">
              {linkedSubtickets.length === 0 ? (
                <p>No subtickets linked.</p>
              ) : (
                linkedSubtickets.map((subticket) => {
                  const subticketBlockers = resolveTicketBlockers(subticket, board.tickets, board.columns);
                  return (
                    <div className="subticket-item" key={subticket.id}>
                      <button className="subticket-row" onClick={() => onOpenTicket(subticket.id)}>
                        <strong>{subticket.title}</strong>
                        <span>{statusName(board.columns, subticket.status)}</span>
                        {subticketBlockers.isBlocked && <span className="ticket-blocker-pill active">Blocked</span>}
                        {subticketBlockers.warnings.length > 0 && <span className="ticket-blocker-pill warning">Blocker Warning</span>}
                        <em className={clsx("priority", subticket.priority)}>{subticket.priority}</em>
                      </button>
                      <button
                        className="icon-button"
                        onClick={() => void unlinkChildTicket(subticket.id)}
                        disabled={subticketBusy}
                        aria-label={`Unlink ${subticket.title}`}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            {addTicketsOpen && (
              <div className="add-subticket-panel">
                <label className="field">
                  <span>New Subticket</span>
                  <input
                    value={newSubticketTitle}
                    onChange={(event) => setNewSubticketTitle(event.target.value)}
                    placeholder="Subticket title"
                  />
                </label>
                <div className="two-fields">
                  <label className="field">
                    <span>Priority</span>
                    <select value={newSubticketPriority} onChange={(event) => setNewSubticketPriority(event.target.value as TicketPriority)}>
                      {priorityOptions.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Labels</span>
                    <input value={newSubticketLabels} onChange={(event) => setNewSubticketLabels(event.target.value)} />
                  </label>
                </div>
                <button className="primary-button" onClick={() => void createChildTicket()} disabled={subticketBusy || newSubticketTitle.trim().length === 0}>
                  {subticketBusy ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
                  Create Subticket
                </button>
                <div className="link-existing-row">
                  <label className="field">
                    <span>Link Existing</span>
                    <select value={linkSubticketId} onChange={(event) => setLinkSubticketId(event.target.value)} disabled={linkableTickets.length === 0}>
                      <option value="">{linkableTickets.length === 0 ? "No available task tickets" : "Select a ticket"}</option>
                      {linkableTickets.map((candidate) => (
                        <option value={candidate.id} key={candidate.id}>
                          {ticketBlockerOptionLabel(candidate, board.tickets, board.columns)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button onClick={() => void linkExistingTicket()} disabled={subticketBusy || !linkSubticketId}>
                    <Plus size={16} />
                    Link
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        <ClarificationPanel
          questions={clarifications}
          answerDrafts={answerDrafts}
          submittingId={submittingAnswerId}
          onDraftChange={(questionId, answer) => setAnswerDrafts((current) => ({ ...current, [questionId]: answer }))}
          onSubmit={(questionId) => void submitClarificationAnswer(questionId)}
        />

        <section className="ticket-update-panel">
          <header>
            <h3>Agent Ticket Update</h3>
            <span className={clsx("run-pill", ticketUpdateStatus)}>{runLabel(ticketUpdateStatus)}</span>
          </header>
          <label className="field">
            <span>Change Request</span>
            <textarea
              ref={ticketUpdateInputRef}
              className="ticket-update-input"
              value={ticketUpdateRequest}
              placeholder="Add acceptance criteria, revise requirements, capture new context..."
              disabled={ticketUpdateActive || draftInProgress}
              onChange={(event) => {
                setTicketUpdateRequest(event.target.value);
                if (ticketUpdateError) setTicketUpdateError(null);
              }}
            />
          </label>
          <div className="ticket-update-actions">
            <button
              className="primary-button"
              onClick={() => void startTicketUpdate()}
              disabled={ticketUpdateActive || draftInProgress || ticketUpdateRequest.trim().length === 0}
            >
              {ticketUpdateActive ? <Loader2 className="spin" size={16} /> : <Send size={16} />}
              Update Ticket
            </button>
            {ticketUpdateActive && ticketUpdateRunId && (
              <button onClick={() => void cancelTicketUpdate()} disabled={ticketUpdateCancelling}>
                {ticketUpdateCancelling ? <Loader2 className="spin" size={16} /> : <X size={16} />}
                Stop
              </button>
            )}
            <button onClick={() => setTicketUpdateLogViewerOpen(true)} disabled={!ticketUpdateRunId && ticketUpdateEvents.length === 0}>
              <CircleDashed size={16} />
              Logs
            </button>
          </div>
          {ticketUpdateError && (
            <div className="ticket-update-error" role="alert">
              <AlertTriangle size={16} />
              <span>{ticketUpdateError}</span>
            </div>
          )}
          {(ticketUpdateRunId || ticketUpdateStatus !== "idle") && (
            <AgentProgressSummary
              events={ticketUpdateEvents}
              status={ticketUpdateStatus}
              startedAt={ticketUpdateStartedAt}
              endedAt={ticketUpdateEndedAt}
              metricsAvailable={ticketUpdateEvents.length > 0}
            />
          )}
        </section>

        <div className="editor-stack">
          <label className="field">
            <span>Title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} disabled={draftInProgress} />
          </label>
          <div className="two-fields">
            <label className="field">
              <span>Status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)} disabled={draftInProgress}>
                {board.columns.map((column) => (
                  <option value={column.id} key={column.id}>
                    {column.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Priority</span>
              <select value={priority} onChange={(event) => setPriority(event.target.value as TicketPriority)} disabled={draftInProgress}>
                {priorityOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Labels</span>
            <input ref={labelsInputRef} value={labels} onChange={(event) => setLabels(event.target.value)} disabled={draftInProgress} />
          </label>
          <label className="field">
            <span>Markdown</span>
            <textarea
              ref={markdownEditorRef}
              className={clsx("markdown-editor detail-markdown", attachmentDropActive && "drop-active")}
              value={markdown}
              onChange={(event) => setMarkdown(event.target.value)}
              onDragOver={handleMarkdownDragOver}
              onDragLeave={handleMarkdownDragLeave}
              onDrop={(event) => void handleMarkdownDrop(event)}
              disabled={draftInProgress || attachmentDropBusy}
            />
          </label>
          <MarkdownBlock
            className="ticket-markdown-preview"
            source={markdown}
            title="Preview"
            onCopied={(kind) => setToast(copyToast(kind))}
            onCopyError={(error) => setToast({ kind: "error", message: error instanceof Error ? error.message : "Unable to copy." })}
          />
        </div>
          </>
        )}

        <AgentActivityPanel
          events={currentRunEvents}
          status={ticket.frontMatter.runStatus}
          runId={runId}
          runSummary={runSummary}
          logLoading={logLoading}
          logError={logError}
          onOpenLogs={() => setLogViewerOpen(true)}
          onRevealFile={() => void getRelayApi().ticket.revealFile(projectPath, ticketId)}
        />

        {!draftInProgress && (
          <div className="danger-row">
            <button onClick={duplicate}>
              <Copy size={16} />
              Duplicate
            </button>
            <button className="danger" onClick={remove}>
              <Trash2 size={16} />
              Delete
            </button>
          </div>
        )}
      </aside>
      {logViewerOpen && (
        <AgentLogViewer
          title={`${ticket.frontMatter.title} Logs`}
          events={currentRunEvents}
          loading={logLoading}
          error={logError}
          onClose={() => setLogViewerOpen(false)}
          onCopied={(kind) => setToast(copyToast(kind))}
          onCopyError={(error) => setToast({ kind: "error", message: error instanceof Error ? error.message : "Unable to copy." })}
        />
      )}
      {ticketUpdateLogViewerOpen && (
        <AgentLogViewer
          title={`${ticket.frontMatter.title} Ticket Update Logs`}
          events={ticketUpdateEvents}
          loading={false}
          error={null}
          onClose={() => setTicketUpdateLogViewerOpen(false)}
          onCopied={(kind) => setToast(copyToast(kind))}
          onCopyError={(error) => setToast({ kind: "error", message: error instanceof Error ? error.message : "Unable to copy." })}
        />
      )}
    </>
  );
}

export function App(): ReactElement {
  if (!hasRelayApi()) {
    return (
      <main className="preload-error">
        <h1>Relay preload did not load</h1>
        <p>Restart the Electron app so the secure desktop bridge can attach.</p>
      </main>
    );
  }

  return (
    <KeyboardShortcutProvider>
      <RelayApp />
    </KeyboardShortcutProvider>
  );
}

function RelayApp(): ReactElement {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<Toast>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [ticketSuggestionsOpen, setTicketSuggestionsOpen] = useState(false);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [codexStatus, setCodexStatus] = useState<CodexStatus>(initialCodexStatus);
  const [events, setEvents] = useState<RendererRunEvent[]>([]);
  const [gitMetadataByPath, setGitMetadataByPath] = useState<Record<string, GitMetadata | undefined>>({});
  const boardRequestRef = useRef(0);
  const gitMetadataRequestRef = useRef<Record<string, number>>({});

  const gitMetadataError = useCallback(
    (message: string): GitMetadata => ({
      state: "error",
      isGitRepository: false,
      branchName: null,
      isDetachedHead: false,
      commitSha: null,
      isDirty: false,
      changedFileCount: null,
      message,
      error: message,
      updatedAt: new Date().toISOString()
    }),
    []
  );

  const refreshProjectGitMetadata = useCallback(
    async (projectPath: string, force = false): Promise<void> => {
      const requestId = (gitMetadataRequestRef.current[projectPath] ?? 0) + 1;
      gitMetadataRequestRef.current[projectPath] = requestId;
      setGitMetadataByPath((current) =>
        current[projectPath] ? current : { ...current, [projectPath]: loadingGitMetadata() }
      );

      try {
        const metadata = await getRelayApi().projects.gitMetadata(projectPath, { force });
        if (gitMetadataRequestRef.current[projectPath] === requestId) {
          setGitMetadataByPath((current) => ({ ...current, [projectPath]: metadata }));
        }
      } catch (error) {
        if (gitMetadataRequestRef.current[projectPath] === requestId) {
          const message = error instanceof Error ? error.message : "Unable to load Git metadata.";
          setGitMetadataByPath((current) => ({ ...current, [projectPath]: gitMetadataError(message) }));
        }
      }
    },
    [gitMetadataError]
  );

  const refreshProjectListGitMetadata = useCallback(
    (nextProjects: ProjectSummary[], force = false): void => {
      const projectPaths = new Set(nextProjects.map((project) => project.path));
      setGitMetadataByPath((current) =>
        Object.fromEntries(Object.entries(current).filter(([projectPath]) => projectPaths.has(projectPath)))
      );
      nextProjects.forEach((project) => {
        void refreshProjectGitMetadata(project.path, force);
      });
    },
    [refreshProjectGitMetadata]
  );

  const updateProjectFromBoard = useCallback((nextBoard: BoardSnapshot): void => {
    setProjects((current) =>
      current.map((project) => (project.path === nextBoard.project.path ? { ...project, ...nextBoard.project } : project))
    );
  }, []);

  const loadProjects = useCallback(async () => {
    const nextProjects = await getRelayApi().projects.list();
    setProjects(nextProjects);
    setSelectedPath((current) => current ?? nextProjects[0]?.path ?? null);
    refreshProjectListGitMetadata(nextProjects, true);
  }, [refreshProjectListGitMetadata]);

  const loadBoard = useCallback(async () => {
    const requestId = boardRequestRef.current + 1;
    boardRequestRef.current = requestId;
    if (!selectedPath) {
      setBoard(null);
      return;
    }
    const projectPath = selectedPath;
    const nextBoard = await getRelayApi().board.read(projectPath);
    if (boardRequestRef.current === requestId) {
      setBoard(nextBoard);
      updateProjectFromBoard(nextBoard);
    }
  }, [selectedPath, updateProjectFromBoard]);

  const selectProject = useCallback(
    (projectPath: string | null) => {
      if (projectPath === selectedPath) return;
      setOpenTicketId(null);
      setCreateOpen(false);
      setTicketSuggestionsOpen(false);
      setBoard(null);
      setQuery("");
      setSelectedPath(projectPath);
    },
    [selectedPath]
  );

  useEffect(() => {
    void loadProjects();
    void getRelayApi().codex.status().then(setCodexStatus);
  }, [loadProjects]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    if (selectedPath) void refreshProjectGitMetadata(selectedPath, true);
  }, [refreshProjectGitMetadata, selectedPath]);

  useEffect(() => {
    const refreshSelectedGitMetadata = (): void => {
      if (selectedPath) void refreshProjectGitMetadata(selectedPath, true);
    };
    window.addEventListener("focus", refreshSelectedGitMetadata);
    return () => window.removeEventListener("focus", refreshSelectedGitMetadata);
  }, [refreshProjectGitMetadata, selectedPath]);

  useEffect(() => {
    setOpenTicketId(null);
    setCreateOpen(false);
    setTicketSuggestionsOpen(false);
  }, [selectedPath]);

  useEffect(() => {
    if (!openTicketId || !board) return;
    if (!board.tickets.some((ticket) => ticket.id === openTicketId)) {
      setOpenTicketId(null);
    }
  }, [board, openTicketId]);

  useEffect(() => {
    return getRelayApi().codex.onRunEvent((event) => {
      setEvents((current) => [...current.slice(-400), event]);
      if (
        event.type === "run.started" ||
        event.type === "run.completed" ||
        event.type === "run.failed" ||
        event.type === "clarification.requested" ||
        event.type === "ticket.status_changed"
      ) {
        void loadBoard();
      }
    });
  }, [loadBoard]);

  const addProject = async (): Promise<void> => {
    setLoading(true);
    try {
      const result = await getRelayApi().projects.addFolder();
      if (result) {
        await loadProjects();
        selectProject(result.project.path);
        setToast({ kind: "success", message: result.initialized ? "Project initialized." : "Project added." });
      }
    } catch (error) {
      setToast({ kind: "error", message: error instanceof Error ? error.message : "Unable to add project." });
    } finally {
      setLoading(false);
    }
  };

  const moveTicket = async (event: DragEndEvent): Promise<void> => {
    if (!selectedPath || !event.over) return;
    const ticketId = String(event.active.id);
    const targetStatus = String(event.over.id);
    const ticket = board?.tickets.find((item) => item.id === ticketId);
    if (!ticket || ticket.status === targetStatus) return;
    const nextBoard = await getRelayApi().ticket.move({ projectPath: selectedPath, ticketId, targetStatus });
    setBoard(nextBoard);
    updateProjectFromBoard(nextBoard);
  };

  const refreshAll = async (): Promise<void> => {
    await loadProjects();
    await loadBoard();
  };

  const selectedEvents = useMemo(
    () => events.filter((event) => event.projectPath === selectedPath && event.ticketId === openTicketId),
    [events, openTicketId, selectedPath]
  );
  const createShortcutEnabled = Boolean(board && selectedPath && !createOpen && !ticketSuggestionsOpen && !openTicketId);

  useKeyboardShortcut({
    id: "create-ticket",
    enabled: createShortcutEnabled,
    priority: 10,
    matcher: isCreateTicketShortcut,
    handler: () => {
      setCreateOpen(true);
      return true;
    }
  });

  return (
    <div className={clsx("app-shell", openTicketId && "detail-open", (createOpen || ticketSuggestionsOpen) && "modal-open")}>
      <ProjectSidebar
        projects={projects}
        selectedPath={selectedPath}
        loading={loading}
        onAdd={addProject}
        onSelect={selectProject}
        onRemove={async (projectPath) => {
          const nextProjects = await getRelayApi().projects.removeFromSidebar(projectPath);
          setProjects(nextProjects);
          refreshProjectListGitMetadata(nextProjects, true);
          if (selectedPath === projectPath) selectProject(nextProjects[0]?.path ?? null);
        }}
        onReveal={(projectPath) => void getRelayApi().projects.revealInFinder(projectPath)}
      />

      {board ? (
        <BoardView
          board={board}
          query={query}
          ticketNavigationEnabled={!createOpen && !ticketSuggestionsOpen && !openTicketId}
          onQuery={setQuery}
          onCreate={() => setCreateOpen(true)}
          onGenerateTickets={() => setTicketSuggestionsOpen(true)}
          onOpenTicket={setOpenTicketId}
          onMove={(event) => void moveTicket(event)}
          gitMetadata={gitMetadataByPath[board.project.path]}
        />
      ) : (
        <main className="workspace empty-state">
          <h1>No project selected</h1>
          <p>Add a local folder to create a Relay board.</p>
          <button className="primary-button" onClick={addProject}>
            <FolderPlus size={16} />
            Add Project
          </button>
        </main>
      )}

      <aside className="status-rail">
        <div className={clsx("codex-status", codexStatus.cliAvailable && "ok")}>
          <Code2 size={17} />
          <div>
            <strong>Codex</strong>
            <span>{codexStatus.cliVersion ?? codexStatus.message}</span>
          </div>
          <button onClick={() => getRelayApi().codex.status().then(setCodexStatus)} aria-label="Refresh Codex status">
            <RefreshCw size={14} />
          </button>
        </div>
      </aside>

      {board && selectedPath && createOpen && (
        <CreateTicketModal projectPath={selectedPath} onClose={() => setCreateOpen(false)} onCreated={refreshAll} setToast={setToast} />
      )}

      {board && selectedPath && ticketSuggestionsOpen && (
        <TicketSuggestionsModal
          projectPath={selectedPath}
          onClose={() => setTicketSuggestionsOpen(false)}
          onCreated={refreshAll}
          setToast={setToast}
        />
      )}

      {board && selectedPath && openTicketId && (
        <TicketDetail
          projectPath={selectedPath}
          ticketId={openTicketId}
          board={board}
          events={selectedEvents}
          onClose={() => setOpenTicketId(null)}
          onOpenTicket={setOpenTicketId}
          onChanged={refreshAll}
          setToast={setToast}
        />
      )}

      {toast && (
        <div
          className={clsx("toast", toast.kind)}
          onClick={() => setToast(null)}
          role={toast.kind === "error" ? "alert" : "status"}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
