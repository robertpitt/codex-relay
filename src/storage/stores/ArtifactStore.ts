/**
 * Artifact storage for user-provided ticket attachments.
 */
import { Context, Effect, FileSystem, Layer, Path } from "effect";
import type { TicketAttachmentSaveInput, TicketAttachmentSaveResult } from "@shared/schemas";
import { imageAttachmentExtension, isSupportedImageAttachment } from "@shared/attachments";
import { newId } from "../ids";
import { attachmentsPath, slashPath } from "../paths";
import { mapStoreWriteError, type StoreEffect } from "./effects";

export type ArtifactStoreService = {
  readonly saveAttachment: (input: TicketAttachmentSaveInput) => StoreEffect<TicketAttachmentSaveResult, FileSystem.FileSystem | Path.Path>;
};

export const ArtifactStore = Context.Service<ArtifactStoreService>("relay/storage/ArtifactStore");

const sanitizeAttachmentBaseName = (path: Path.Path, fileName: string): string => {
  const baseName = path.basename(fileName.trim() || "image");
  const extension = path.extname(baseName);
  const withoutExtension = extension ? baseName.slice(0, -extension.length) : baseName;
  const sanitized = withoutExtension
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^\.+/g, "")
    .slice(0, 64);
  return sanitized || "image";
};

const decodeBase64Content = (contentBase64: string): Uint8Array => {
  const normalized = contentBase64.replace(/\s+/g, "");
  if (!normalized || normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error("Attachment content must be valid base64.");
  }
  return Uint8Array.from(globalThis.atob(normalized), (char) => char.charCodeAt(0));
};

export const makeFileSystemArtifactStore = (): ArtifactStoreService => ({
  saveAttachment: (input) => {
    return Effect.gen(function*() {
      const path = yield* Path.Path;
      const targetDirectory = attachmentsPath(path, input.projectPath);
      const mimeType = input.mimeType ?? null;
      if (!isSupportedImageAttachment({ fileName: input.fileName, mimeType })) {
        throw new Error("Only image attachments can be saved.");
      }

      const content = decodeBase64Content(input.contentBase64);
      const extension = imageAttachmentExtension(input.fileName, mimeType);
      const safeBaseName = sanitizeAttachmentBaseName(path, input.fileName);
      const fileName = `${safeBaseName}-${newId("att")}${extension}`;
      const absolutePath = path.join(targetDirectory, fileName);
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(targetDirectory, { recursive: true });
      yield* fs.writeFile(absolutePath, content);

      return {
        fileName,
        markdownPath: slashPath(path.relative(input.projectPath, absolutePath)),
        absolutePath
      };
    }).pipe(Effect.mapError(mapStoreWriteError(input.projectPath, "Save Relay ticket attachment")));
  }
});

export const FileSystemArtifactStoreLive = Layer.succeed(ArtifactStore)(makeFileSystemArtifactStore());
