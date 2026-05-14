import { Effect } from "effect";
import { AtomicFile, AtomicFileLive } from "./AtomicFile";
import { fileExistsEffect } from "../io";
import { runBackendEffect } from "../runtime";

export const fileExists = (target: string): Promise<boolean> => runBackendEffect(fileExistsEffect(target));

const runAtomicFile = <A>(effect: Effect.Effect<A, unknown, any>): Promise<A> => runBackendEffect(Effect.provide(effect, AtomicFileLive));

export const atomicWriteJson = (target: string, value: unknown): Promise<void> =>
  runAtomicFile(AtomicFile.use((file) => file.writeJson(target, value)));

export const atomicWriteText = (target: string, value: string): Promise<void> =>
  runAtomicFile(AtomicFile.use((file) => file.writeText(target, value)));
