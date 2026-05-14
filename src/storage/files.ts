import { Context, Effect } from "effect";
import { AtomicFile, AtomicFileLive } from "./AtomicFile";
import { runBackendEffect, type BackendServices } from "../runtime";

const runAtomicFile = <A>(
  effect: Effect.Effect<A, unknown, BackendServices | Context.Service.Identifier<typeof AtomicFile>>
): Promise<A> =>
  runBackendEffect(Effect.provide(effect, AtomicFileLive));

export const atomicWriteJson = (target: string, value: unknown): Promise<void> =>
  runAtomicFile(AtomicFile.use((file) => file.writeJson(target, value)));

export const atomicWriteText = (target: string, value: string): Promise<void> =>
  runAtomicFile(AtomicFile.use((file) => file.writeText(target, value)));
