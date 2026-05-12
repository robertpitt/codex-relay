export const SUPPORTED_IMAGE_EXTENSIONS = [
  ".avif",
  ".bmp",
  ".gif",
  ".heic",
  ".heif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".tif",
  ".tiff",
  ".webp"
] as const;

const supportedImageExtensionSet = new Set<string>(SUPPORTED_IMAGE_EXTENSIONS);

const mimeTypeExtensionMap = new Map<string, string>([
  ["image/avif", ".avif"],
  ["image/bmp", ".bmp"],
  ["image/gif", ".gif"],
  ["image/heic", ".heic"],
  ["image/heif", ".heif"],
  ["image/jpeg", ".jpg"],
  ["image/jpg", ".jpg"],
  ["image/png", ".png"],
  ["image/svg+xml", ".svg"],
  ["image/tiff", ".tiff"],
  ["image/vnd.microsoft.icon", ".ico"],
  ["image/webp", ".webp"],
  ["image/x-icon", ".ico"]
]);

const normalizedMimeType = (mimeType?: string | null): string => (mimeType ?? "").split(";")[0].trim().toLowerCase();

export const imageExtensionFromFileName = (fileName: string): string | null => {
  const match = /\.[a-z0-9]+$/i.exec(fileName.trim());
  if (!match) return null;
  const extension = match[0].toLowerCase();
  return supportedImageExtensionSet.has(extension) ? extension : null;
};

export const imageExtensionFromMimeType = (mimeType?: string | null): string | null => {
  const normalized = normalizedMimeType(mimeType);
  if (!normalized) return null;
  return mimeTypeExtensionMap.get(normalized) ?? null;
};

export const imageAttachmentExtension = (fileName: string, mimeType?: string | null): string =>
  imageExtensionFromFileName(fileName) ?? imageExtensionFromMimeType(mimeType) ?? ".png";

export const isSupportedImageAttachment = ({
  fileName,
  mimeType
}: {
  fileName: string;
  mimeType?: string | null;
}): boolean => {
  const normalized = normalizedMimeType(mimeType);
  return normalized.startsWith("image/") || imageExtensionFromFileName(fileName) !== null;
};
