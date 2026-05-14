import { isSupportedImageAttachment } from "@shared/attachments";
import type { TicketAttachmentSaveInput, TicketAttachmentSaveResult } from "@shared/schemas";

export type DroppedImageFile = Pick<File, "arrayBuffer" | "name" | "type">;

const clampSelection = (value: string, position: number): number => Math.min(Math.max(position, 0), value.length);

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

export const isSupportedDroppedImageFile = (file: Pick<File, "name" | "type">): boolean =>
  isSupportedImageAttachment({ fileName: file.name, mimeType: file.type || null });

export const droppedImageFileToAttachmentInput = async (
  projectPath: string,
  file: DroppedImageFile
): Promise<TicketAttachmentSaveInput> => ({
  projectPath,
  fileName: file.name,
  mimeType: file.type || null,
  contentBase64: arrayBufferToBase64(await file.arrayBuffer())
});

const escapeMarkdownImageAlt = (value: string): string => value.replace(/\\/g, "\\\\").replace(/([\[\]])/g, "\\$1");

export const attachmentMarkdownReference = (attachment: TicketAttachmentSaveResult): string =>
  `![${escapeMarkdownImageAlt(attachment.fileName)}](${attachment.markdownPath})`;

export const attachmentMarkdownBlock = (attachments: TicketAttachmentSaveResult[]): string =>
  attachments.map(attachmentMarkdownReference).join("\n");

export const insertMarkdownAtSelection = (
  value: string,
  insertion: string,
  selectionStart: number,
  selectionEnd = selectionStart
): { value: string; cursor: number } => {
  const trimmedInsertion = insertion.trim();
  if (!trimmedInsertion) return { value, cursor: clampSelection(value, selectionStart) };

  const start = clampSelection(value, Math.min(selectionStart, selectionEnd));
  const end = clampSelection(value, Math.max(selectionStart, selectionEnd));
  const before = value.slice(0, start);
  const after = value.slice(end);
  const prefix = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
  const suffix = after.length > 0 && !after.startsWith("\n") ? "\n" : "";
  const inserted = `${prefix}${trimmedInsertion}${suffix}`;

  return {
    value: `${before}${inserted}${after}`,
    cursor: before.length + inserted.length
  };
};
