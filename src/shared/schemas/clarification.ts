import { Schema } from "effect";
import {
  isoString,
  mutableArray,
  nonEmptyString,
  nullableStringWithDefault,
  passthroughStruct,
  withDefault,
  type SchemaType
} from "./common";
import { relayActorSchema, relayEventSourceSchema } from "./primitives";

export const clarificationAnswerTypeSchema = Schema.Literal("text");
export type ClarificationAnswerType = SchemaType<typeof clarificationAnswerTypeSchema>;

export const clarificationQuestionSchema = passthroughStruct({
  id: nonEmptyString,
  ticketId: nonEmptyString,
  question: nonEmptyString,
  answerType: clarificationAnswerTypeSchema,
  answer: nullableStringWithDefault(),
  createdAt: isoString,
  updatedAt: isoString,
  answeredAt: withDefault(Schema.NullOr(isoString), () => null),
  createdBy: relayActorSchema,
  source: relayEventSourceSchema,
  runId: nullableStringWithDefault(),
  codexThreadId: nullableStringWithDefault()
});
export type ClarificationQuestion = SchemaType<typeof clarificationQuestionSchema>;

export const clarificationStoreSchema = passthroughStruct({
  schemaVersion: Schema.Literal(1),
  ticketId: nonEmptyString,
  questions: withDefault(mutableArray(clarificationQuestionSchema), () => [])
});
export type ClarificationQuestionStore = SchemaType<typeof clarificationStoreSchema>;

export const clarificationQuestionCreateInputSchema = passthroughStruct({
  question: Schema.String,
  answerType: Schema.optional(clarificationAnswerTypeSchema)
});
export type ClarificationQuestionCreateInput = SchemaType<typeof clarificationQuestionCreateInputSchema>;

export const clarificationAnswerInputSchema = passthroughStruct({
  projectPath: Schema.String,
  ticketId: Schema.String,
  questionId: Schema.String,
  answer: Schema.String
});
export type ClarificationAnswerInput = SchemaType<typeof clarificationAnswerInputSchema>;
