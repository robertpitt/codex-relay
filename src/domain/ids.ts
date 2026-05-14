/**
 * Branded identifiers for Relay's backend domain.
 *
 * Runtime payloads remain plain strings at IPC and storage boundaries; these
 * aliases document intent inside Effect services without changing wire shapes.
 */
import type { Brand } from "effect";

export type ProjectPath = string & Brand.Brand<"ProjectPath">;
export type ProjectId = string & Brand.Brand<"ProjectId">;
export type TicketId = string & Brand.Brand<"TicketId">;
export type RunId = string & Brand.Brand<"RunId">;
export type ClarificationId = string & Brand.Brand<"ClarificationId">;
export type AttachmentId = string & Brand.Brand<"AttachmentId">;
export type KernelExecutionId = string & Brand.Brand<"KernelExecutionId">;
export type GitRefName = string & Brand.Brand<"GitRefName">;

export const ProjectPath = (value: string): ProjectPath => value as ProjectPath;
export const ProjectId = (value: string): ProjectId => value as ProjectId;
export const TicketId = (value: string): TicketId => value as TicketId;
export const RunId = (value: string): RunId => value as RunId;
export const ClarificationId = (value: string): ClarificationId => value as ClarificationId;
export const AttachmentId = (value: string): AttachmentId => value as AttachmentId;
export const KernelExecutionId = (value: string): KernelExecutionId => value as KernelExecutionId;
export const GitRefName = (value: string): GitRefName => value as GitRefName;
