import { Layer } from "effect";
import { NodeFileSystemLive } from "./filesystem";
import { HttpClientLive } from "./http";
import { NodePathLive } from "./path";
import { CommandExecutorLive } from "./process";
import { SocketBoundaryLive } from "./socket";

export * from "./filesystem";
export * from "./http";
export * from "./path";
export * from "./process";
export * from "./socket";

export const IoLive = Layer.mergeAll(NodeFileSystemLive, NodePathLive, CommandExecutorLive, HttpClientLive, SocketBoundaryLive);
