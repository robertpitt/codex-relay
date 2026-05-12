import { Check, CircleDashed, Send } from "lucide-react";
import type { ReactElement } from "react";
import type { ClarificationQuestion } from "@shared/types";
import { MarkdownBlock } from "./MarkdownBlock";

type ClarificationPanelProps = {
  questions: ClarificationQuestion[];
  answerDrafts: Record<string, string>;
  submittingId: string | null;
  onDraftChange: (questionId: string, answer: string) => void;
  onSubmit: (questionId: string) => void;
  title?: string;
  summary?: string;
  className?: string;
};

export function ClarificationPanel({
  questions,
  answerDrafts,
  submittingId,
  onDraftChange,
  onSubmit,
  title = "Clarifications",
  summary,
  className
}: ClarificationPanelProps): ReactElement | null {
  if (questions.length === 0) return null;

  return (
    <section className={["clarification-panel", className].filter(Boolean).join(" ")}>
      <header>
        <h3>{title}</h3>
        <span>
          {summary ?? `${questions.filter((question) => question.answer?.trim()).length}/${questions.length} answered`}
        </span>
      </header>
      <div className="clarification-list">
        {questions.map((question) => {
          const answered = Boolean(question.answer?.trim());
          return (
            <article
              className={`clarification-card ${answered ? "answered" : "pending"}`}
              data-status={answered ? "answered" : "unanswered"}
              key={question.id}
            >
              <div className="clarification-question">
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
                  />
                  <button
                    className="primary-button"
                    onClick={() => onSubmit(question.id)}
                    disabled={submittingId === question.id || !(answerDrafts[question.id] ?? "").trim()}
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
