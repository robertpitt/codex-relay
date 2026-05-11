import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import clsx from "clsx";
import {
  AlertTriangle,
  Check,
  CircleDashed,
  Code2,
  Copy,
  ExternalLink,
  FolderPlus,
  GitBranch,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import type {
  BoardSnapshot,
  ClarificationQuestion,
  CodexStatus,
  ProjectSummary,
  RelayColumn,
  RendererRunEvent,
  RunStatus,
  TicketDraftErrorPayload,
  TicketPriority,
  TicketRecord,
  TicketSummary
} from "@shared/types";
import { AgentActivityPanel, AgentLogViewer, AgentProgressSummary } from "./components/AgentActivity";
import { ClarificationPanel } from "./components/ClarificationPanel";
import { MarkdownBlock } from "./components/MarkdownBlock";
import { mergeRunEvents } from "./lib/agentProgress";
import { emptyTicketMarkdown, markdownFromDraft } from "./lib/markdown";

type Toast = { kind: "info" | "error" | "success"; message: string } | null;
type LocalAgentProgress = { status: RunStatus; startedAt: string; endedAt?: string | null };

const priorityOptions: TicketPriority[] = ["low", "medium", "high", "urgent"];

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

// Markdown audit: create-ticket drafts, ticket detail bodies, clarification text,
// and generated Codex completion/final-response console events use MarkdownBlock.
// Board excerpts and command output stay plain text because they are summaries/logs.
const copyToast = (kind: "markdown" | "code"): Toast => ({
  kind: "success",
  message: kind === "code" ? "Code copied." : "Markdown source copied."
});

function ProjectSidebar({
  projects,
  selectedPath,
  loading,
  onAdd,
  onSelect,
  onRemove,
  onReveal
}: {
  projects: ProjectSummary[];
  selectedPath: string | null;
  loading: boolean;
  onAdd: () => void;
  onSelect: (projectPath: string) => void;
  onRemove: (projectPath: string) => void;
  onReveal: (projectPath: string) => void;
}): ReactElement {
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

      <div className="sidebar-list">
        {projects.map((project) => (
          <button
            className={clsx("project-row", selectedPath === project.path && "selected")}
            key={project.path}
            onClick={() => onSelect(project.path)}
            aria-current={selectedPath === project.path ? "page" : undefined}
          >
            <span className="project-main">
              <span className="project-name">{project.name}</span>
              <span className="project-path">{shortPath(project.path)}</span>
            </span>
            <span className="project-badges">
              {!project.isGitRepository && <GitBranch size={13} />}
              {project.health !== "ok" && <AlertTriangle size={13} />}
              {project.activeRunCount > 0 && <CircleDashed size={13} />}
            </span>
          </button>
        ))}
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
  onOpen
}: {
  column: RelayColumn;
  tickets: TicketSummary[];
  onOpen: (ticketId: string) => void;
}): ReactElement {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <section ref={setNodeRef} className={clsx("board-column", isOver && "over")}>
      <header className="column-header">
        <h2>{column.name}</h2>
        <span>{tickets.length}</span>
      </header>
      <div className="column-body">
        {tickets.map((ticket) => (
          <DraggableCard key={ticket.id} ticket={ticket} onOpen={onOpen} />
        ))}
        {tickets.length === 0 && <div className="empty-column">No tickets</div>}
      </div>
    </section>
  );
}

function DraggableCard({ ticket, onOpen }: { ticket: TicketSummary; onOpen: (ticketId: string) => void }): ReactElement {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: ticket.id });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;
  return (
    <article ref={setNodeRef} style={style} className={clsx("ticket-card", isDragging && "dragging")}>
      <button className="card-open" onClick={() => onOpen(ticket.id)}>
        <div className="card-title">{ticket.title}</div>
        <p>{ticket.excerpt || "No details yet."}</p>
        <div className="card-meta">
          <span className={clsx("priority", ticket.priority)}>{ticket.priority}</span>
          <span className={clsx("run-pill", ticket.runStatus)}>{runLabel(ticket.runStatus)}</span>
        </div>
        {ticket.labels.length > 0 && (
          <div className="labels">
            {ticket.labels.map((label) => (
              <span key={label}>{label}</span>
            ))}
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
  onQuery,
  onCreate,
  onOpenTicket,
  onMove
}: {
  board: BoardSnapshot;
  query: string;
  onQuery: (query: string) => void;
  onCreate: () => void;
  onOpenTicket: (ticketId: string) => void;
  onMove: (event: DragEndEvent) => void;
}): ReactElement {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const filteredTickets = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return board.tickets;
    return board.tickets.filter((ticket) => {
      const haystack = `${ticket.title} ${ticket.excerpt} ${ticket.labels.join(" ")}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [board.tickets, query]);

  return (
    <main className="workspace">
      <div className="topbar">
        <div>
          <h1>{board.project.name}</h1>
          <p>{board.project.path}</p>
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
          <button className="primary-button" onClick={onCreate}>
            <Plus size={16} />
            Create Ticket
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
        <div className="board">
          {board.columns.map((column) => (
            <DroppableColumn
              key={column.id}
              column={column}
              tickets={filteredTickets.filter((ticket) => ticket.status === column.id).sort((a, b) => a.position - b.position)}
              onOpen={onOpenTicket}
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
  const [manualTitle, setManualTitle] = useState("");
  const [manualMarkdown, setManualMarkdown] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("medium");
  const [labels, setLabels] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  const [draftMessageKind, setDraftMessageKind] = useState<"info" | "error">("info");
  const [draftFailure, setDraftFailure] = useState<TicketDraftErrorPayload | null>(null);
  const [draftProgress, setDraftProgress] = useState<LocalAgentProgress | null>(null);
  const draftRequestRef = useRef(0);

  const seedManualFallback = (ideaSnapshot: string): void => {
    const fallbackTitle = ideaSnapshot.split("\n")[0]?.trim() || "Untitled Ticket";
    setManualTitle((current) => (current.trim().length > 0 ? current : fallbackTitle));
    setManualMarkdown((current) => (current.trim().length > 0 ? current : emptyTicketMarkdown(fallbackTitle)));
  };

  const draftTicket = async (): Promise<void> => {
    const requestSequence = draftRequestRef.current + 1;
    draftRequestRef.current = requestSequence;
    const ideaSnapshot = idea;
    setBusy(true);
    setDraftFailure(null);
    setDraftProgress({ status: "drafting", startedAt: new Date().toISOString() });
    setDraftMessageKind("info");
    setDraftMessage("Codex is drafting the ticket. If Codex is not authenticated or does not respond, this will time out after 90 seconds.");
    try {
      const result = await window.relay.ticket.createDraft({ projectPath, idea: ideaSnapshot });
      if (draftRequestRef.current !== requestSequence) return;
      if (!result.ok) {
        setDraftFailure(result.error);
        setDraftProgress((current) =>
          current ? { ...current, status: "failed", endedAt: new Date().toISOString() } : current
        );
        setToast({ kind: "error", message: result.error.message });
        setDraftMessageKind("error");
        setDraftMessage(result.error.message);
        seedManualFallback(ideaSnapshot);
        return;
      }
      const nextDraft = result.draft;
      setManualTitle(nextDraft.title);
      setManualMarkdown(markdownFromDraft(nextDraft));
      setPriority(nextDraft.priority);
      setLabels(nextDraft.labels.join(", "));
      setDraftFailure(null);
      setDraftProgress((current) =>
        current ? { ...current, status: "completed", endedAt: new Date().toISOString() } : current
      );
      setDraftMessageKind("info");
      setDraftMessage("Draft ready. Review and save it to the board.");
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
      seedManualFallback(ideaSnapshot);
    } finally {
      if (draftRequestRef.current === requestSequence) setBusy(false);
    }
  };

  const save = async (): Promise<void> => {
    const title = manualTitle.trim() || idea.split("\n")[0]?.trim() || "Untitled Ticket";
    setSaving(true);
    try {
      await window.relay.ticket.createManual(projectPath, {
        title,
        priority,
        labels: labels
          .split(",")
          .map((label) => label.trim())
          .filter(Boolean),
        markdown: manualMarkdown.trim() || emptyTicketMarkdown(title)
      });
      setToast({ kind: "success", message: "Ticket created." });
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
      <section className="modal create-modal" role="dialog" aria-modal="true" aria-labelledby="create-ticket-title">
        <header>
          <div>
            <h2 id="create-ticket-title">Create Ticket</h2>
            <p>Draft a clear implementation ticket from a rough idea.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close create ticket dialog">
            <X size={18} />
          </button>
        </header>

        <div className="modal-grid">
          <label className="field">
            <span>Idea</span>
            <textarea value={idea} onChange={(event) => setIdea(event.target.value)} placeholder="Describe what you want built..." />
          </label>
          <div className="draft-actions">
            <button className="primary-button" onClick={draftTicket} disabled={busy || idea.trim().length === 0}>
              {busy ? <Loader2 className="spin" size={16} /> : draftFailure?.recoverable ? <RefreshCw size={16} /> : <Code2 size={16} />}
              {busy ? "Drafting..." : draftFailure?.recoverable ? "Retry Codex" : "Draft with Codex"}
            </button>
            <button
              onClick={() => {
                const title = idea.split("\n")[0]?.trim() || "Untitled Ticket";
                setManualTitle(title);
                setManualMarkdown(emptyTicketMarkdown(title));
                setDraftFailure(null);
                setDraftProgress(null);
                setDraftMessageKind("info");
                setDraftMessage("Manual ticket template ready. You can save without waiting for Codex.");
              }}
            >
              Manual Draft
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

        <div className="editor-stack">
          <label className="field">
            <span>Title</span>
            <input
              value={manualTitle}
              onChange={(event) => setManualTitle(event.target.value)}
              placeholder={idea.split("\n")[0]?.trim() || "Untitled Ticket"}
            />
          </label>
          <div className="two-fields">
            <label className="field">
              <span>Priority</span>
              <select value={priority} onChange={(event) => setPriority(event.target.value as TicketPriority)}>
                {priorityOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Labels</span>
              <input value={labels} onChange={(event) => setLabels(event.target.value)} placeholder="frontend, bug" />
            </label>
          </div>
          <label className="field">
            <span>Ticket Markdown</span>
            <textarea
              className="markdown-editor"
              value={manualMarkdown}
              placeholder="Use Manual Draft or Draft with Codex to fill this in, or write the ticket here."
              onChange={(event) => setManualMarkdown(event.target.value)}
            />
          </label>
          <MarkdownBlock
            className="ticket-markdown-preview"
            source={manualMarkdown}
            title="Preview"
            onCopied={(kind) => setToast(copyToast(kind))}
            onCopyError={(error) => setToast({ kind: "error", message: error instanceof Error ? error.message : "Unable to copy." })}
          />
          <div className="modal-footer">
            <button onClick={onClose}>Cancel</button>
            <button className="primary-button" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="spin" size={16} /> : <Check size={16} />}
              Save Ticket
            </button>
          </div>
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
  onChanged,
  setToast
}: {
  projectPath: string;
  ticketId: string;
  board: BoardSnapshot;
  events: RendererRunEvent[];
  onClose: () => void;
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

  const load = useCallback(async () => {
    setDetailError(null);
    try {
      const [record, questions] = await Promise.all([
        window.relay.ticket.read(projectPath, ticketId),
        window.relay.ticket.clarifications(projectPath, ticketId)
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
    if (events.some((event) => event.type === "clarification.requested")) void load();
  }, [events, load]);

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
    void window.relay.codex
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
    const liveRunEvents = runId ? events.filter((event) => event.runId === runId) : events;
    return mergeRunEvents(persistedEvents, liveRunEvents);
  }, [events, persistedEvents, runId]);

  const save = async (): Promise<void> => {
    if (!ticket) return;
    setBusy(true);
    try {
      await window.relay.ticket.save({
        projectPath,
        ticket: {
          ...ticket,
          markdown,
          frontMatter: {
            ...ticket.frontMatter,
            title,
            priority,
            status,
            labels: labels
              .split(",")
              .map((label) => label.trim())
              .filter(Boolean)
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

  const startRun = async (resume: boolean): Promise<void> => {
    setBusy(true);
    try {
      const result = resume
        ? await window.relay.codex.resumeRun({ projectPath, ticketId })
        : await window.relay.codex.startRun({ projectPath, ticketId });
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

  const cancelRun = async (): Promise<void> => {
    if (!runId) return;
    await window.relay.codex.cancelRun(runId);
    setToast({ kind: "info", message: "Run cancelled." });
    onChanged();
    await load();
  };

  const submitClarificationAnswer = async (questionId: string): Promise<void> => {
    const answer = answerDrafts[questionId]?.trim();
    if (!answer) return;
    setSubmittingAnswerId(questionId);
    try {
      await window.relay.ticket.answerClarification({ projectPath, ticketId, questionId, answer });
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
    await window.relay.ticket.delete(projectPath, ticketId);
    setToast({ kind: "success", message: "Ticket moved to trash." });
    onChanged();
    onClose();
  };

  const duplicate = async (): Promise<void> => {
    await window.relay.ticket.duplicate(projectPath, ticketId);
    setToast({ kind: "success", message: "Ticket duplicated." });
    onChanged();
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
          <button className="primary-button" onClick={() => startRun(Boolean(ticket.frontMatter.codexThreadId))} disabled={busy}>
            {busy ? <Loader2 className="spin" size={16} /> : <Play size={16} />}
            {ticket.frontMatter.codexThreadId ? "Resume Codex" : "Start Codex"}
          </button>
          {runId && ticket.frontMatter.runStatus === "running" && (
            <button onClick={cancelRun}>
              <X size={16} />
              Stop
            </button>
          )}
          <button onClick={save} disabled={busy}>
            <Save size={16} />
            Save
          </button>
        </div>

        <ClarificationPanel
          questions={clarifications}
          answerDrafts={answerDrafts}
          submittingId={submittingAnswerId}
          onDraftChange={(questionId, answer) => setAnswerDrafts((current) => ({ ...current, [questionId]: answer }))}
          onSubmit={(questionId) => void submitClarificationAnswer(questionId)}
        />

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
          onRevealFile={() => void window.relay.ticket.revealFile(projectPath, ticketId)}
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
    </>
  );
}

export function App(): ReactElement {
  if (!window.relay) {
    return (
      <main className="preload-error">
        <h1>Relay preload did not load</h1>
        <p>Restart the Electron app so the secure desktop bridge can attach.</p>
      </main>
    );
  }

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
  const boardRequestRef = useRef(0);

  const loadProjects = useCallback(async () => {
    const nextProjects = await window.relay.projects.list();
    setProjects(nextProjects);
    setSelectedPath((current) => current ?? nextProjects[0]?.path ?? null);
  }, []);

  const loadBoard = useCallback(async () => {
    const requestId = boardRequestRef.current + 1;
    boardRequestRef.current = requestId;
    if (!selectedPath) {
      setBoard(null);
      return;
    }
    const projectPath = selectedPath;
    const nextBoard = await window.relay.board.read(projectPath);
    if (boardRequestRef.current === requestId) {
      setBoard(nextBoard);
    }
  }, [selectedPath]);

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
    void window.relay.codex.status().then(setCodexStatus);
  }, [loadProjects]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

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
    return window.relay.codex.onRunEvent((event) => {
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
      const result = await window.relay.projects.addFolder();
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
    const nextBoard = await window.relay.ticket.move({ projectPath: selectedPath, ticketId, targetStatus });
    setBoard(nextBoard);
  };

  const refreshAll = async (): Promise<void> => {
    await loadProjects();
    await loadBoard();
  };

  const selectedEvents = useMemo(
    () => events.filter((event) => event.projectPath === selectedPath && event.ticketId === openTicketId),
    [events, openTicketId, selectedPath]
  );

  return (
    <div className="app-shell">
      <ProjectSidebar
        projects={projects}
        selectedPath={selectedPath}
        loading={loading}
        onAdd={addProject}
        onSelect={selectProject}
        onRemove={async (projectPath) => {
          const nextProjects = await window.relay.projects.removeFromSidebar(projectPath);
          setProjects(nextProjects);
          if (selectedPath === projectPath) selectProject(nextProjects[0]?.path ?? null);
        }}
        onReveal={(projectPath) => void window.relay.projects.revealInFinder(projectPath)}
      />

      {board ? (
        <BoardView
          board={board}
          query={query}
          onQuery={setQuery}
          onCreate={() => setCreateOpen(true)}
          onOpenTicket={setOpenTicketId}
          onMove={(event) => void moveTicket(event)}
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
          <button onClick={() => window.relay.codex.status().then(setCodexStatus)} aria-label="Refresh Codex status">
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
