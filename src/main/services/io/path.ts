import { Effect, Layer, Path } from "effect";
import nodePath from "node:path";

const nodePathService: Path.Path = {
  [Path.TypeId]: Path.TypeId,
  sep: nodePath.sep,
  basename: nodePath.basename,
  dirname: nodePath.dirname,
  extname: nodePath.extname,
  format: nodePath.format,
  fromFileUrl: (url) => Effect.succeed(nodePath.normalize(url.pathname)),
  isAbsolute: nodePath.isAbsolute,
  join: nodePath.join,
  normalize: nodePath.normalize,
  parse: nodePath.parse,
  relative: nodePath.relative,
  resolve: nodePath.resolve,
  toFileUrl: (target) => Effect.succeed(new URL(`file://${target}`)),
  toNamespacedPath: nodePath.toNamespacedPath
};

export const NodePathLive = Layer.succeed(Path.Path, nodePathService);

export const pathBasename = (target: string, suffix?: string): string => nodePath.basename(target, suffix);
export const pathDirname = (target: string): string => nodePath.dirname(target);
export const pathExtname = (target: string): string => nodePath.extname(target);
export const pathJoin = (...parts: string[]): string => nodePath.join(...parts);
export const pathRelative = (from: string, to: string): string => nodePath.relative(from, to);
export const pathResolve = (...parts: string[]): string => nodePath.resolve(...parts);
