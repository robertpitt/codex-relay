import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import clsx from "clsx";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  CircleDashed,
  Code2,
  Copy,
  ExternalLink,
  FolderPlus,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Trash2,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, ReactElement } from "react";
import type {
  BoardSnapshot,
  ClarificationQuestion,
  CodexRunPreflightResult,
  CodexStatus,
  GitMetadata,
  ProjectSummary,
  RelayColumn,
  RendererRunEvent,
  RunStatus,
  TicketDraft,
  TicketDraftErrorPayload,
  TicketDraftSubticket,
  TicketPriority,
  TicketReferenceCandidate,
  TicketRecord,
  TicketSummary,
  TicketType
} from "@shared/types";
import { AgentActivityPanel, AgentLogViewer, AgentProgressSummary } from "./components/AgentActivity";
import { ClarificationPanel } from "./components/ClarificationPanel";
import { GitMetadataPill, loadingGitMetadata } from "./components/GitMetadata";
import { MarkdownBlock } from "./components/MarkdownBlock";
import { isAgentSessionActive, mergeRunEvents } from "./lib/agentProgress";
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
type ActiveTicketReferenceMention = {
  token: TicketMentionToken;
};

type DraftArrayField =
  | "labels"
  | "researchFindings"
  | "requirements"
  | "implementationPlan"
  | "acceptanceCriteria"
  | "clarificationQuestions"
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

const shortPath = (projectPath: string): string => {
  const parts = projectPath.split("/");
  if (parts.length <= 4) return projectPath;
  return `.../${parts.slice(-3).join("/")}`;
};

const projectDisclosureTargetId = (project: ProjectSummary, index: number): string => {
  const stableKey = project.projectId ?? `${project.name}-${index}-${project.path}`;
  return `project-swimlanes-${stableKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
};

const ticketCountLabel = (count: number): string => `${count} ${count === 1 ? "ticket" : "tickets"}`;

const runLabel = (status: TicketSummary["runStatus"]): string => {
  switch (status) {
    case "idle":
      return "Idle";
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
    default:
      return "Idle";
  }
};

const ticketTypeLabel = (ticketType: TicketType): string => (ticketType === "epic" ? "Epic" : "Task");

const labelsFromInput = (value: string): string[] =>
  value
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);

const linesFromInput = (value: string): string[] =>
  value.split("\n");

const linesToInput = (items: string[]): string => items.join("\n");

const manualSubticketMarkdown = (childTitle: string, parentTitle: string): string => `# ${childTitle}

## Parent Epic

${parentTitle}

## Context

Subticket of ${parentTitle}.

## Research Findings

- None.

## Requirements

- Define the unique scope for this child task before starting implementation.

## Implementation Plan

- Review the parent epic context and narrow this ticket to one implementation path.

## Acceptance Criteria

- The child task has specific acceptance criteria before work starts.

## Clarification Questions

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

export function ProjectSidebar({
  projects,
  selectedPath,
  gitMetadataByPath,
  loading,
  onAdd,
  onSelect,
  onRemove,
  onReveal,
  defaultExpandedProjectPaths = []
}: {
  projects: ProjectSummary[];
  selectedPath: string | null;
  gitMetadataByPath: Record<string, GitMetadata | undefined>;
  loading: boolean;
  onAdd: () => void;
  onSelect: (projectPath: string) => void;
  onRemove: (projectPath: string) => void;
  onReveal: (projectPath: string) => void;
  defaultExpandedProjectPaths?: string[];
}): ReactElement {
  const [expandedProjectPaths, setExpandedProjectPaths] = useState<Set<string>>(() => new Set(defaultExpandedProjectPaths));

  const toggleProject = useCallback((projectPath: string): void => {
    setExpandedProjectPaths((current) => {
      const next = new Set(current);
      if (next.has(projectPath)) {
        next.delete(projectPath);
      } else {
        next.add(projectPath);
      }
      return next;
    });
  }, []);

  return (
    <aside className="sidebar" aria-label="Projects">
      <div className="brand">
        <div className="brand-mark">R</div>
        <div>
          <h1>Relay</h1>
          <p>Local Codex boards</p>
        </div>
      </div>

      <button className="primary-button full" onClick={onAdd} disabled={loading}>
        {loading ? <Loader2 className="spin" size={16} /> : <FolderPlus size={16} />}
        Add Project
      </button>

      <div className="sidebar-list" role="list">
        {projects.map((project, index) => {
          const gitMetadata = gitMetadataByPath[project.path] ?? loadingGitMetadata();
          const expanded = expandedProjectPaths.has(project.path);
          const swimlaneListId = projectDisclosureTargetId(project, index);
          return (
            <div className="project-group" key={project.path} role="listitem">
              <div className={clsx("project-row-shell", selectedPath === project.path && "selected")}>
                <button
                  type="button"
                  className="project-disclosure"
                  onClick={() => toggleProject(project.path)}
                  aria-expanded={expanded}
                  aria-controls={swimlaneListId}
                  aria-label={`${expanded ? "Collapse" : "Expand"} ${project.name} swimlanes`}
                >
                  <ChevronRight className={clsx("project-disclosure-icon", expanded && "expanded")} size={15} />
                </button>
                <button
                  type="button"
                  className={clsx("project-row", selectedPath === project.path && "selected")}
                  onClick={() => onSelect(project.path)}
                  aria-current={selectedPath === project.path ? "page" : undefined}
                >
                  <span className="project-main">
                    <span className="project-name">{project.name}</span>
                    <span className="project-path">{shortPath(project.path)}</span>
                    <GitMetadataPill metadata={gitMetadata} compact />
                  </span>
                  <span className="project-badges">
                    {project.health !== "ok" && <AlertTriangle size={13} />}
                    {project.activeRunCount > 0 && <CircleDashed size={13} />}
                  </span>
                </button>
              </div>
              {expanded && (
                <div id={swimlaneListId} className="project-swimlane-list" role="list" aria-label={`${project.name} swimlanes`}>
                  {project.swimlanes.length > 0 ? (
                    project.swimlanes.map((swimlane) => (
                      <div
                        className="project-swimlane-row"
                        key={swimlane.id}
                        role="listitem"
                        aria-label={`${swimlane.name}: ${ticketCountLabel(swimlane.ticketCount)}`}
                      >
                        <span className="project-swimlane-name">{swimlane.name}</span>
                        <span className="project-swimlane-count" aria-hidden="true">
                          {swimlane.ticketCount}
                        </span>
                      </div>
                    ))
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
  selectedTicketId,
  onOpen,
  onTicketFocus,
  onTicketButtonRef
}: {
  column: RelayColumn;
  tickets: TicketSummary[];
  selectedTicketId: string | null;
  onOpen: (ticketId: string) => void;
  onTicketFocus: (ticketId: string) => void;
  onTicketButtonRef: (ticketId: string, node: HTMLButtonElement | null) => void;
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
            selected={ticket.id === selectedTicketId}
            onOpen={onOpen}
            onFocus={onTicketFocus}
            onTicketButtonRef={onTicketButtonRef}
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

function DraggableCard({
  ticket,
  selected,
  onOpen,
  onFocus,
  onTicketButtonRef
}: {
  ticket: TicketSummary;
  selected: boolean;
  onOpen: (ticketId: string) => void;
  onFocus: (ticketId: string) => void;
  onTicketButtonRef: (ticketId: string, node: HTMLButtonElement | null) => void;
}): ReactElement {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: ticket.id });
  const dragTransform = transform ? CSS.Translate.toString(transform) : null;
  const style = dragTransform ? { transform: dragTransform } : undefined;
  const visibleLabels = ticket.labels.slice(0, 2);
  const hiddenLabelCount = ticket.labels.length - visibleLabels.length;
  const showPriority = ticket.priority === "high" || ticket.priority === "urgent";
  const showRunStatus = ticket.runStatus !== "idle";
  const showRelationship = ticket.ticketType === "epic" || Boolean(ticket.parentEpicId);
  return (
    <article ref={setNodeRef} style={style} className={clsx("ticket-card", isDragging && "dragging", selected && "keyboard-selected")}>
      <button
        ref={(node) => onTicketButtonRef(ticket.id, node)}
        className="card-open"
        data-ticket-id={ticket.id}
        onClick={() => onOpen(ticket.id)}
        onFocus={() => onFocus(ticket.id)}
      >
        <div className="card-title">{ticket.title}</div>
        <p className="card-excerpt">{ticket.excerpt || "No details yet."}</p>
        {(showRelationship || showPriority || showRunStatus) && (
          <div className="card-meta">
            {ticket.ticketType === "epic" && <span className="ticket-type-pill epic">Epic</span>}
            {ticket.parentEpicId && <span className="ticket-type-pill subticket">Subticket</span>}
            {showPriority && <span className={clsx("priority", ticket.priority)}>{ticket.priority}</span>}
            {showRunStatus && <span className={clsx("run-pill", ticket.runStatus)}>{runLabel(ticket.runStatus)}</span>}
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
  onOpenTicket,
  onMove,
  gitMetadata
}: {
  board: BoardSnapshot;
  query: string;
  ticketNavigationEnabled: boolean;
  onQuery: (query: string) => void;
  onCreate: () => void;
  onOpenTicket: (ticketId: string) => void;
  onMove: (event: DragEndEvent) => void;
  gitMetadata: GitMetadata | undefined;
}): ReactElement {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const boardRef = useRef<HTMLDivElement | null>(null);
  const ticketButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
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
              selectedTicketId={selectedTicketId}
              onOpen={onOpenTicket}
              onTicketFocus={setSelectedTicketId}
              onTicketButtonRef={setTicketButtonRef}
            />
          ))}
        </div>
      </DndContext>
    </main>
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
  onCreated: () => void;
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
    setBusy(true);
    setDraft(null);
    setDraftFailure(null);
    setDraftProgress({ status: "drafting", startedAt: new Date().toISOString() });
    setDraftMessageKind("info");
    setDraftMessage("Codex is drafting the ticket. If Codex is not authenticated or does not respond, this will time out after 90 seconds.");
    try {
      const result = await getRelayApi().ticket.createDraft({ projectPath, idea: ideaSnapshot, preferredTicketType: ticketType });
      if (draftRequestRef.current !== requestSequence) return;
      if (!result.ok) {
        setDraftFailure(result.error);
        setDraftProgress((current) =>
          current ? { ...current, status: "failed", endedAt: new Date().toISOString() } : current
        );
        setToast({ kind: "error", message: result.error.message });
        setDraftMessageKind("error");
        setDraftMessage(result.error.message);
        return;
      }
      const nextDraft = result.draft;
      setDraft(nextDraft);
      setTicketType(nextDraft.ticketType);
      setTicketReferenceMention(null);
      setDraftFailure(null);
      setDraftProgress((current) =>
        current ? { ...current, status: "completed", endedAt: new Date().toISOString() } : current
      );
      setDraftMessageKind("info");
      setDraftMessage("Draft ready. Review and edit the plan before creating it.");
    } catch (error) {
      if (draftRequestRef.current !== requestSequence) return;
      const message = error instanceof Error ? error.message : "Ticket drafting failed.";
      setToast({ kind: "error", message });
      setDraftFailure(null);
      setDraftProgress((current) =>
        current ? { ...current, status: "failed", endedAt: new Date().toISOString() } : current
      );
      setDraftMessageKind("error");
      setDraftMessage(message);
    } finally {
      if (draftRequestRef.current === requestSequence) setBusy(false);
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
    value: string[],
    onChange: (value: string[]) => void,
    placeholder: string
  ): ReactElement => (
    <label className="field">
      <span>{label}</span>
      <textarea className="draft-plan-textarea" value={linesToInput(value)} placeholder={placeholder} onChange={(event) => onChange(linesFromInput(event.target.value))} />
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
              {busy ? "Drafting..." : draftFailure?.recoverable ? "Retry Codex" : "Draft with Codex"}
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
              {renderPlanListField("Research Findings", draft.researchFindings, (value) => updateDraftArrayField("researchFindings", value), "One finding per line")}
              {renderPlanListField("Requirements", draft.requirements, (value) => updateDraftArrayField("requirements", value), "One requirement per line")}
              {renderPlanListField(
                "Implementation Plan",
                draft.implementationPlan,
                (value) => updateDraftArrayField("implementationPlan", value),
                "One implementation step per line"
              )}
              {renderPlanListField(
                "Acceptance Criteria",
                draft.acceptanceCriteria,
                (value) => updateDraftArrayField("acceptanceCriteria", value),
                "One acceptance criterion per line"
              )}
              {renderPlanListField(
                "Clarification Questions",
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
                      {renderPlanListField("Research Findings", subticket.researchFindings, (value) => updateSubticket(index, { researchFindings: value }), "One finding per line")}
                      {renderPlanListField("Requirements", subticket.requirements, (value) => updateSubticket(index, { requirements: value }), "One requirement per line")}
                      {renderPlanListField(
                        "Implementation Plan",
                        subticket.implementationPlan,
                        (value) => updateSubticket(index, { implementationPlan: value }),
                        "One implementation step per line"
                      )}
                      {renderPlanListField(
                        "Acceptance Criteria",
                        subticket.acceptanceCriteria,
                        (value) => updateSubticket(index, { acceptanceCriteria: value }),
                        "One acceptance criterion per line"
                      )}
                      {renderPlanListField(
                        "Clarification Questions",
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
  const [markdown, setMarkdown] = useState("");
  const [busy, setBusy] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [clarifications, setClarifications] = useState<ClarificationQuestion[]>([]);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [submittingAnswerId, setSubmittingAnswerId] = useState<string | null>(null);
  const [persistedEvents, setPersistedEvents] = useState<RendererRunEvent[]>([]);
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
  const [addTicketsOpen, setAddTicketsOpen] = useState(false);
  const [newSubticketTitle, setNewSubticketTitle] = useState("");
  const [newSubticketPriority, setNewSubticketPriority] = useState<TicketPriority>("medium");
  const [newSubticketLabels, setNewSubticketLabels] = useState("");
  const [linkSubticketId, setLinkSubticketId] = useState("");
  const [subticketBusy, setSubticketBusy] = useState(false);
  const ticketUpdateInputRef = useRef<HTMLTextAreaElement | null>(null);

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
    setRunPreflight(null);
    setAddTicketsOpen(false);
    setNewSubticketTitle("");
    setNewSubticketPriority("medium");
    setNewSubticketLabels("");
    setLinkSubticketId("");
    setSubticketBusy(false);
  }, [projectPath, ticketId]);

  useEffect(() => {
    if (
      events.some(
        (event) =>
          event.ticketId === ticketId &&
          (event.type === "clarification.requested" || event.type === "run.completed" || event.type === "ticket.status_changed")
      )
    ) {
      void load();
    }
  }, [events, load, ticketId]);

  useEffect(() => {
    let cancelled = false;
    if (!runId) {
      setPersistedEvents([]);
      setLogError(null);
      setLogLoading(false);
      return undefined;
    }

    setLogLoading(true);
    setLogError(null);
    void getRelayApi().codex
      .readRunEvents(projectPath, ticketId, runId)
      .then((runEvents) => {
        if (!cancelled) setPersistedEvents(runEvents);
      })
      .catch((error) => {
        if (!cancelled) {
          setPersistedEvents([]);
          setLogError(error instanceof Error ? error.message : "Unknown error");
        }
      })
      .finally(() => {
        if (!cancelled) setLogLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectPath, runId, ticketId]);

  const currentRunEvents = useMemo(() => {
    const liveRunEvents = runId ? events.filter((event) => event.runId === runId) : [];
    return mergeRunEvents(persistedEvents, liveRunEvents);
  }, [events, persistedEvents, runId]);
  const ticketUpdateEvents = useMemo(
    () => (ticketUpdateRunId ? events.filter((event) => event.runId === ticketUpdateRunId) : []),
    [events, ticketUpdateRunId]
  );
  const ticketUpdateActive = isAgentSessionActive(ticketUpdateStatus) || ticketUpdateCancelling;
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
      markdown !== ticket.markdown ||
      Object.values(answerDrafts).some((answer) => answer.trim().length > 0)
    );
  }, [
    answerDrafts,
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

  const save = async (): Promise<void> => {
    if (!ticket) return;
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
            labels: labelsFromInput(labels)
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
    if (!ticket || ticketUpdateActive) return;
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
      setToast({ kind: "info", message: `Codex run started: ${result.runId}` });
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
            <span className={clsx("run-pill", ticket.frontMatter.runStatus)}>{runLabel(ticket.frontMatter.runStatus)}</span>
            <h2>{ticket.frontMatter.title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close ticket detail">
            <X size={18} />
          </button>
        </header>

        <div className="detail-actions">
          <button className="primary-button" onClick={() => startRun(Boolean(ticket.frontMatter.codexThreadId))} disabled={busy || ticketUpdateActive}>
            {busy ? <Loader2 className="spin" size={16} /> : <Play size={16} />}
            {ticket.frontMatter.codexThreadId ? "Resume Codex" : "Start Codex"}
          </button>
          {ticket.frontMatter.codexThreadId && (
            <button onClick={() => startRun(false, true)} disabled={busy || ticketUpdateActive}>
              {busy ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
              Start Fresh Thread
            </button>
          )}
          {runId && ticket.frontMatter.runStatus === "running" && (
            <button onClick={cancelRun}>
              <X size={16} />
              Stop
            </button>
          )}
          {completedStatusAvailable && ticket.frontMatter.status === "review" && (
            <button onClick={() => void moveTicketTo("completed", "Ticket accepted.")} disabled={busy || ticketUpdateActive}>
              <Check size={16} />
              Mark Accepted
            </button>
          )}
          {reviewStatusAvailable && ticket.frontMatter.status === "review" && (
            <button onClick={requestChanges} disabled={busy || ticketUpdateActive}>
              <Send size={16} />
              Request Changes
            </button>
          )}
          {ticket.frontMatter.status === "completed" && todoStatusAvailable && (
            <button onClick={() => void moveTicketTo("todo", "Ticket reopened.")} disabled={busy || ticketUpdateActive}>
              <RefreshCw size={16} />
              Reopen
            </button>
          )}
          <button onClick={save} disabled={busy || ticketUpdateActive}>
            <Save size={16} />
            Save
          </button>
        </div>

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

        {parentEpic && (
          <section className="epic-link-panel">
            <header>
              <h3>Parent Epic</h3>
            </header>
            <button className="subticket-row parent" onClick={() => onOpenTicket(parentEpic.id)}>
              <strong>{parentEpic.title}</strong>
              <span>{statusName(board.columns, parentEpic.status)}</span>
              <em className={clsx("priority", parentEpic.priority)}>{parentEpic.priority}</em>
            </button>
          </section>
        )}

        {ticket.frontMatter.ticketType === "epic" && (
          <section className="epic-link-panel">
            <header>
              <h3>Subtickets</h3>
              <button onClick={() => setAddTicketsOpen((open) => !open)} disabled={subticketBusy}>
                {subticketBusy ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
                Add Tickets
              </button>
            </header>
            <div className="subticket-list">
              {linkedSubtickets.length === 0 ? (
                <p>No subtickets linked.</p>
              ) : (
                linkedSubtickets.map((subticket) => (
                  <div className="subticket-item" key={subticket.id}>
                    <button className="subticket-row" onClick={() => onOpenTicket(subticket.id)}>
                      <strong>{subticket.title}</strong>
                      <span>{statusName(board.columns, subticket.status)}</span>
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
                ))
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
                          {candidate.title}
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
              disabled={ticketUpdateActive}
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
              disabled={ticketUpdateActive || ticketUpdateRequest.trim().length === 0}
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
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <div className="two-fields">
            <label className="field">
              <span>Status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                {board.columns.map((column) => (
                  <option value={column.id} key={column.id}>
                    {column.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Priority</span>
              <select value={priority} onChange={(event) => setPriority(event.target.value as TicketPriority)}>
                {priorityOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Labels</span>
            <input value={labels} onChange={(event) => setLabels(event.target.value)} />
          </label>
          <label className="field">
            <span>Markdown</span>
            <textarea className="markdown-editor detail-markdown" value={markdown} onChange={(event) => setMarkdown(event.target.value)} />
          </label>
          <MarkdownBlock
            className="ticket-markdown-preview"
            source={markdown}
            title="Preview"
            onCopied={(kind) => setToast(copyToast(kind))}
            onCopyError={(error) => setToast({ kind: "error", message: error instanceof Error ? error.message : "Unable to copy." })}
          />
        </div>

        <AgentActivityPanel
          events={currentRunEvents}
          status={ticket.frontMatter.runStatus}
          runId={runId}
          logLoading={logLoading}
          logError={logError}
          onOpenLogs={() => setLogViewerOpen(true)}
          onRevealFile={() => void getRelayApi().ticket.revealFile(projectPath, ticketId)}
        />

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
  const createShortcutEnabled = Boolean(board && selectedPath && !createOpen && !openTicketId);

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
    <div className={clsx("app-shell", openTicketId && "detail-open", createOpen && "modal-open")}>
      <ProjectSidebar
        projects={projects}
        selectedPath={selectedPath}
        gitMetadataByPath={gitMetadataByPath}
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
          ticketNavigationEnabled={!createOpen && !openTicketId}
          onQuery={setQuery}
          onCreate={() => setCreateOpen(true)}
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
