import { Layer } from "effect";
import * as NodeChildProcessSpawner from "@effect/platform-node-shared/NodeChildProcessSpawner";
import { FetchHttpClientLive } from "../platform/FetchHttpClient";
import { NodeFileSystemLive } from "../platform/NodeFileSystem";
import { NodeHostRuntimeLive } from "../platform/NodeHostRuntime";
import { SocketBoundaryLive } from "../platform/SocketBoundary";
import { NodePathLive } from "./path";

export {
  HostRuntime,
  hostCwd,
  hostEnvironment,
  hostEnvVar,
  hostHomeDirectory,
  hostResolvePackageJson,
  hostRuntimePlatform,
  type HostRuntimeService,
  type RuntimePlatform
} from "./HostRuntime";
export { fetchUrlEffect, HttpClient, type HttpClientService } from "./http";
export {
  NodePathLive,
  pathBasename,
  pathDirname,
  pathExtname,
  pathIsAbsolute,
  pathJoin,
  pathRelative,
  pathResolve,
  PathLive
} from "./path";

const BaseIoLive = Layer.mergeAll(
  NodeFileSystemLive,
  NodePathLive,
  NodeHostRuntimeLive,
  FetchHttpClientLive,
  SocketBoundaryLive
);

export const IoLive = Layer.provideMerge(NodeChildProcessSpawner.layer, BaseIoLive);
