import { Layer } from "effect";
import * as NodeChildProcessSpawner from "@effect/platform-node-shared/NodeChildProcessSpawner";
import * as NodeFileSystem from "@effect/platform-node-shared/NodeFileSystem";
import * as NodePath from "@effect/platform-node-shared/NodePath";

const BaseBackendPlatformLive = Layer.mergeAll(
  NodeFileSystem.layer,
  NodePath.layer
);

export const BackendPlatformLive = Layer.provideMerge(NodeChildProcessSpawner.layer, BaseBackendPlatformLive);
