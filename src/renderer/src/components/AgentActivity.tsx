import clsx from "clsx";
import { Activity, Clock, FileText, Files, Globe2, List, Loader2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import type { RendererRunEvent, RunStatus } from "@shared/types";
import { MarkdownBlock } from "./MarkdownBlock";
import {
  agentEventLabel,
  agentEventText,
  agentEventTone,
  deriveAgentProgress,
  isAgentSessionActive,
  isMarkdownAgentEvent,
  sortAgentEvents
} from "../lib/agentProgress";

type CopyHandlers = {
  onCopied?: (kind: "markdown" | "code") => void;
  onCopyError?: (error: unknown) => void;
};

type AgentProgressSummaryProps = {
  events: RendererRunEvent[];
  status: RunStatus;
  startedAt?: string | null;
  endedAt?: string | null;
  metricsAvailable?: boolean;
  now?: number;
};

const useProgressNow = (active: boolean, now?: number): number => {
  const [currentNow, setCurrentNow] = useState(() => now ?? Date.now());

  useEffect(() => {
    if (now !== undefined) {
      setCurrentNow(now);
      return undefined;
    }
    if (!active) {
      setCurrentNow(Date.now());
      return undefined;
    }
    const interval = window.setInterval(() => setCurrentNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [active, now]);

  return now ?? currentNow;
};

const formatTimestamp = (timestamp: string): string =>
  new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const metricValue = (value: number | null): string => (value === null ? "Unavailable" : String(value));

export function AgentProgressSummary({
  events,
  status,
  startedAt,
  endedAt,
  metricsAvailable,
  now
}: AgentProgressSummaryProps): ReactElement {
  const active = isAgentSessionActive(status);
  const currentNow = useProgressNow(active, now);
  const progress = useMemo(
    () => deriveAgentProgress({ events, status, startedAt, endedAt, now: currentNow, metricsAvailable }),
    [currentNow, endedAt, events, metricsAvailable, startedAt, status]
  );

  return (
    <div className={clsx("agent-progress", progress.statusTone)} data-status={status}>
      <div className="agent-progress-main">
        <span className="agent-progress-icon">
          <Activity size={16} />
        </span>
        <div>
          <strong>{progress.statusLabel}</strong>
          <span>{progress.statusDetail}</span>
        </div>
      </div>

      <div className="agent-metrics" aria-label="Agent progress metrics">
        <div className="agent-metric">
          <Clock size={15} />
          <span>Elapsed</span>
          <strong>{progress.elapsedLabel}</strong>
        </div>
        <div className="agent-metric">
          <Files size={15} />
          <span>Files Edited</span>
          <strong>{metricValue(progress.filesEdited)}</strong>
        </div>
        <div className="agent-metric">
          <Globe2 size={15} />
          <span>Web Searches</span>
          <strong>{metricValue(progress.webSearches)}</strong>
        </div>
      </div>

      <div className="agent-progress-foot">
        <span>{progress.totalEvents > 0 ? `${progress.totalEvents} event${progress.totalEvents === 1 ? "" : "s"}` : "No events recorded"}</span>
        {progress.lastEventAt && <span>Last update {formatTimestamp(progress.lastEventAt)}</span>}
      </div>
    </div>
  );
}

export function AgentActivityPanel({
  events,
  status,
  runId,
  logLoading,
  logError,
  onOpenLogs,
  onRevealFile
}: {
  events: RendererRunEvent[];
  status: RunStatus;
  runId: string | null;
  logLoading: boolean;
  logError: string | null;
  onOpenLogs: () => void;
  onRevealFile: () => void;
}): ReactElement {
  const recentEvents = useMemo(
    () =>
      sortAgentEvents(events)
        .filter((event) => event.type !== "command.output")
        .slice(-4),
    [events]
  );

  return (
    <section className="agent-activity-panel">
      <header>
        <h3>Agent Activity</h3>
        <div className="agent-panel-actions">
          <button onClick={onOpenLogs} disabled={!runId && events.length === 0}>
            <List size={14} />
            Open Logs
          </button>
          <button onClick={onRevealFile}>
            <FileText size={14} />
            File
          </button>
        </div>
      </header>

      <AgentProgressSummary events={events} status={status} metricsAvailable={events.length > 0} />

      <div className="agent-recent">
        <div className="agent-recent-title">
          <span>Recent Activity</span>
          {logLoading && (
            <span className="agent-inline-state">
              <Loader2 className="spin" size={13} />
              Loading saved events
            </span>
          )}
        </div>
        {logError && <div className="agent-state error">Unable to load saved logs: {logError}</div>}
        {!logLoading && recentEvents.length === 0 && <div className="agent-state empty">No run events have been recorded for this session.</div>}
        {recentEvents.length > 0 && (
          <div className="agent-recent-list">
            {recentEvents.map((event, index) => (
              <div className={clsx("agent-recent-row", agentEventTone(event))} key={`${event.runId}-${event.timestamp}-${event.type}-${index}`}>
                <span>{formatTimestamp(event.timestamp)}</span>
                <strong>{agentEventLabel(event)}</strong>
                <p>{agentEventText(event)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

const renderEventDetails = (event: RendererRunEvent, handlers: CopyHandlers): ReactElement => {
  const text = agentEventText(event);
  if (isMarkdownAgentEvent(event)) {
    return (
      <MarkdownBlock
        className="agent-log-markdown"
        source={text}
        compact
        onCopied={handlers.onCopied}
        onCopyError={handlers.onCopyError}
      />
    );
  }

  return <pre>{text || "No details."}</pre>;
};

export function AgentLogViewer({
  events,
  loading,
  error,
  title,
  onClose,
  onCopied,
  onCopyError
}: {
  events: RendererRunEvent[];
  loading: boolean;
  error: string | null;
  title: string;
  onClose: () => void;
} & CopyHandlers): ReactElement {
  const orderedEvents = useMemo(() => sortAgentEvents(events), [events]);

  return (
    <div className="modal-backdrop agent-log-backdrop">
      <section className="modal agent-log-modal" role="dialog" aria-modal="true" aria-labelledby="agent-log-title">
        <header>
          <div>
            <h2 id="agent-log-title">{title}</h2>
            <p>{orderedEvents.length} event{orderedEvents.length === 1 ? "" : "s"} in chronological order</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close agent log viewer">
            <X size={18} />
          </button>
        </header>

        {loading && (
          <div className="agent-log-state loading">
            <Loader2 className="spin" size={16} />
            Loading saved log events
          </div>
        )}
        {error && <div className="agent-log-state error">Unable to load saved log events: {error}</div>}
        {!loading && !error && orderedEvents.length === 0 && <div className="agent-log-state empty">No detailed log events are available.</div>}

        {orderedEvents.length > 0 && (
          <ol className="agent-log-list">
            {orderedEvents.map((event, index) => (
              <li className={clsx("agent-log-item", agentEventTone(event))} key={`${event.runId}-${event.timestamp}-${event.type}-${index}`}>
                <div className="agent-log-meta">
                  <time dateTime={event.timestamp}>{formatTimestamp(event.timestamp)}</time>
                  <span>{agentEventLabel(event)}</span>
                  <code>{event.type}</code>
                </div>
                <div className="agent-log-content">{renderEventDetails(event, { onCopied, onCopyError })}</div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
