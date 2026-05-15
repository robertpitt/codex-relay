/**
 * Clarification question storage for blocked draft and implementation runs.
 */
import { Context, Effect, Layer, Path } from "effect";
import type { ClarificationQuestion, ClarificationQuestionCreateInput } from "@shared/schemas";
import * as FileSystemStorage from "../filesystem";
import type { ClarificationQuestionCreateOptions } from "../filesystem";
import { clarificationStorePath } from "../paths";
import { storeRead, storeWrite, type StoreEffect } from "./effects";

export type ClarificationStoreService = {
  readonly list: (projectPath: string, ticketId: string) => StoreEffect<ClarificationQuestion[], Path.Path>;
  readonly create: (
    projectPath: string,
    ticketId: string,
    inputs: readonly ClarificationQuestionCreateInput[],
    options: ClarificationQuestionCreateOptions
  ) => StoreEffect<ClarificationQuestion[], Path.Path>;
  readonly answer: (projectPath: string, ticketId: string, questionId: string, answer: string) => StoreEffect<ClarificationQuestion, Path.Path>;
};

export const ClarificationStore = Context.Service<ClarificationStoreService>("relay/storage/ClarificationStore");

export const makeFileSystemClarificationStore = (): ClarificationStoreService => ({
  list: (projectPath, ticketId) =>
    Path.Path.use((path) =>
      storeRead(clarificationStorePath(path, projectPath, ticketId), "Read Relay clarification questions", () =>
        FileSystemStorage.readClarificationQuestions(projectPath, ticketId)
      )
    ),
  create: (projectPath, ticketId, inputs, options) =>
    Path.Path.use((path) =>
      storeWrite(clarificationStorePath(path, projectPath, ticketId), "Create Relay clarification questions", () =>
        FileSystemStorage.createClarificationQuestions(projectPath, ticketId, [...inputs], options)
      )
    ),
  answer: (projectPath, ticketId, questionId, answer) =>
    Path.Path.use((path) =>
      storeWrite(clarificationStorePath(path, projectPath, ticketId), "Answer Relay clarification question", () =>
        FileSystemStorage.answerClarificationQuestion(projectPath, ticketId, questionId, answer)
      )
    )
});

export const FileSystemClarificationStoreLive = Layer.succeed(ClarificationStore)(makeFileSystemClarificationStore());
