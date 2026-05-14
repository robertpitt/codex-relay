import { Layer } from "effect";
import { FetchHttpClientLive, NodeFileSystemLive, NodeHostRuntimeLive } from "../platform";
import { NodePathLive } from "./path";
import { CommandExecutorLive } from "./process";
import { SocketBoundaryLive } from "./socket";

export * from "./filesystem";
export * from "./HostRuntime";
export * from "./http";
export * from "./path";
export * from "./process";
export * from "./socket";

export const IoLive = Layer.mergeAll(
  NodeFileSystemLive,
  NodePathLive,
  NodeHostRuntimeLive,
  CommandExecutorLive,
  FetchHttpClientLive,
  SocketBoundaryLive
);
