import { Effect, Layer, Path } from "effect";

const pathService = Effect.runSync(
  Effect.gen(function*() {
    return yield* Path.Path;
  }).pipe(Effect.provide(Path.layer))
);

export const PathLive = Path.layer;
export const NodePathLive = PathLive;

export const pathBasename = (target: string, suffix?: string): string => pathService.basename(target, suffix);
export const pathDirname = (target: string): string => pathService.dirname(target);
export const pathExtname = (target: string): string => pathService.extname(target);
export const pathIsAbsolute = (target: string): boolean => pathService.isAbsolute(target);
export const pathJoin = (...parts: string[]): string => pathService.join(...parts);
export const pathRelative = (from: string, to: string): string => pathService.relative(from, to);
export const pathResolve = (...parts: string[]): string => pathService.resolve(...parts);
