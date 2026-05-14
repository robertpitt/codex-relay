/**
 * Ref-backed cache for Git metadata snapshots.
 */
import { Context, Effect, Layer, Ref } from "effect";
import type { GitMetadata } from "@shared/types";

type CacheEntry = {
  readonly value: GitMetadata;
  readonly expiresAt: number;
};

type CacheState = ReadonlyMap<string, CacheEntry>;

export type GitMetadataCacheService = {
  readonly get: (projectPath: string, nowMs: number) => Effect.Effect<GitMetadata | null>;
  readonly set: (projectPath: string, metadata: GitMetadata, expiresAt: number) => Effect.Effect<void>;
  readonly clear: () => Effect.Effect<void>;
};

export const GitMetadataCache = Context.Service<GitMetadataCacheService>("relay/GitMetadataCache");

export const GitMetadataCacheLive = Layer.effect(
  GitMetadataCache,
  Effect.gen(function*() {
    const state = yield* Ref.make<CacheState>(new Map());

    return {
      get: (projectPath, nowMs) =>
        Effect.map(Ref.get(state), (cache) => {
          const entry = cache.get(projectPath);
          return entry && entry.expiresAt > nowMs ? entry.value : null;
        }),
      set: (projectPath, metadata, expiresAt) =>
        Ref.update(state, (cache) => {
          const next = new Map(cache);
          next.set(projectPath, { value: metadata, expiresAt });
          return next;
        }),
      clear: () => Ref.set(state, new Map())
    };
  })
);
