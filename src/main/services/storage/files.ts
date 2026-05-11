import { ulid } from "ulid";
import {
  fileExistsEffect,
  makeDirectoryEffect,
  pathDirname,
  renamePathEffect,
  writeTextFileEffect
} from "../io";
import { runBackendEffect } from "../runtime";

export const fileExists = (target: string): Promise<boolean> => runBackendEffect(fileExistsEffect(target));

export const atomicWriteJson = async (target: string, value: unknown): Promise<void> => {
  await runBackendEffect(makeDirectoryEffect(pathDirname(target)));
  const tmp = `${target}.${process.pid}.${ulid().toLowerCase()}.tmp`;
  await runBackendEffect(writeTextFileEffect(tmp, `${JSON.stringify(value, null, 2)}\n`));
  await runBackendEffect(renamePathEffect(tmp, target));
};

export const atomicWriteText = async (target: string, value: string): Promise<void> => {
  await runBackendEffect(makeDirectoryEffect(pathDirname(target)));
  const tmp = `${target}.${process.pid}.${ulid().toLowerCase()}.tmp`;
  await runBackendEffect(writeTextFileEffect(tmp, value));
  await runBackendEffect(renamePathEffect(tmp, target));
};
