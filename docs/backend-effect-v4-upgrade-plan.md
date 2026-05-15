# Backend Effect Upgrade Plan

This document tracks the current direction for backend Effect usage after the REST API migration.

## Goals

- Keep Effect as an internal backend implementation tool.
- Keep renderer/main communication as a typed local REST API.
- Keep shared contracts declarative and serializable.
- Keep Codex, storage, git, registry, and kernel services testable without renderer code.

## Implementation Rules

- New renderer-facing behavior starts with a contract entry under `src/shared/http`.
- Server behavior is mounted from a resource module under `src/http/resources`.
- Renderer behavior calls `relayApi` from `src/renderer/src/lib/relayApi.ts`.
- Backend workflows should consume service tags or existing workflow helpers rather than direct platform APIs.
- Tests should cover both the shared contract and at least one server route per new resource shape.

## Compatibility

- Existing `.relay` file formats remain source-of-truth data.
- Existing renderer query keys should remain stable unless the UI data model changes.
- Existing Codex run event JSONL records remain readable.
