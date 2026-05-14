import type { ClarificationQuestionCreateInput } from "@shared/schemas";

type RawQuestion = string | { question?: unknown; text?: unknown; answerType?: unknown };

const parseQuestion = (value: RawQuestion): ClarificationQuestionCreateInput | null => {
  if (typeof value === "string") {
    const question = value.trim();
    return question ? { question, answerType: "text" } : null;
  }

  const rawQuestion = typeof value.question === "string" ? value.question : typeof value.text === "string" ? value.text : "";
  const question = rawQuestion.trim();
  if (!question) return null;
  return { question, answerType: "text" };
};

const parseQuestionsJson = (value: string): ClarificationQuestionCreateInput[] => {
  const parsed = JSON.parse(value) as unknown;
  const rawQuestions = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { questions?: unknown }).questions)
      ? (parsed as { questions: unknown[] }).questions
      : [];

  return rawQuestions
    .map((question) => parseQuestion(question as RawQuestion))
    .filter((question): question is ClarificationQuestionCreateInput => Boolean(question))
    .slice(0, 10);
};

export const extractClarificationRequest = (finalResponse: string): ClarificationQuestionCreateInput[] => {
  const questions: ClarificationQuestionCreateInput[] = [];
  const fencePattern = /```relay-clarification\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;

  while ((match = fencePattern.exec(finalResponse))) {
    const json = match[1]?.trim();
    if (!json) continue;
    try {
      questions.push(...parseQuestionsJson(json));
    } catch {
      continue;
    }
  }

  return questions;
};
