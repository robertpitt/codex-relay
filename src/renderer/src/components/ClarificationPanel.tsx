import { Check, CircleDashed, Send } from "lucide-react";
import { useId, type ReactElement } from "react";
import type { ClarificationQuestion } from "@shared/types";
import { MarkdownBlock } from "./MarkdownBlock";

type ClarificationPanelVariant = "default" | "primary" | "sidebar";

type ClarificationPanelProps = {
  questions: ClarificationQuestion[];
  answerDrafts: Record<string, string>;
  submittingId: string | null;
  onDraftChange: (questionId: string, answer: string) => void;
  onSubmit: (questionId: string) => void;
  title?: string;
  summary?: string;
  className?: string;
  variant?: ClarificationPanelVariant;
  ariaLabel?: string;
};

export function ClarificationPanel({
  questions,
  answerDrafts,
  submittingId,
  onDraftChange,
  onSubmit,
  title = "Clarifications",
  summary,
  className,
  variant = "default",
  ariaLabel
}: ClarificationPanelProps): ReactElement | null {
  const headingId = useId();

  if (questions.length === 0) return null;

  const panelClassName = ["clarification-panel", `clarification-panel-${variant}`, className].filter(Boolean).join(" ");

  return (
    <section className={panelClassName} aria-labelledby={headingId}>
      <header>
        <h3 id={headingId}>{title}</h3>
        <span>
          {summary ?? `${questions.filter((question) => question.answer?.trim()).length}/${questions.length} answered`}
        </span>
      </header>
      <div className="clarification-list" role="list" aria-label={ariaLabel ?? title}>
        {questions.map((question) => {
          const answered = Boolean(question.answer?.trim());
          const questionTextId = `${headingId}-${question.id}-question`;
          return (
            <article
              className={`clarification-card ${answered ? "answered" : "pending"}`}
              data-status={answered ? "answered" : "unanswered"}
              key={question.id}
              role="listitem"
            >
              <div className="clarification-question" id={questionTextId}>
                {answered ? <Check size={16} /> : <CircleDashed size={16} />}
                <MarkdownBlock source={question.question} compact />
              </div>
              {answered ? (
                <div className="clarification-answer">
                  <span>Answer</span>
                  <MarkdownBlock source={question.answer ?? ""} compact />
                </div>
              ) : (
                <div className="clarification-form">
                  <textarea
                    value={answerDrafts[question.id] ?? ""}
                    onChange={(event) => onDraftChange(question.id, event.target.value)}
                    placeholder="Answer"
                    aria-label="Answer clarification question"
                    aria-describedby={questionTextId}
                  />
                  <button
                    className="primary-button"
                    onClick={() => onSubmit(question.id)}
                    disabled={submittingId === question.id || !(answerDrafts[question.id] ?? "").trim()}
                    aria-label="Submit answer for clarification question"
                    aria-describedby={questionTextId}
                  >
                    <Send size={15} />
                    Submit Answer
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
