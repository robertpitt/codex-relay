export const isFileNotFoundError = (error: unknown): boolean => {
  if (typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT") {
    return true;
  }
  if (typeof error !== "object" || error === null) return false;
  const platformError = error as { _tag?: unknown; reason?: { _tag?: unknown } };
  return platformError._tag === "PlatformError" && platformError.reason?._tag === "NotFound";
};
