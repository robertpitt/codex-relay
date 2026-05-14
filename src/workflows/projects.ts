import { Effect } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import type { ProjectEditorId, ProjectOpenInEditorInput, ProjectOpenInEditorResult } from "@shared/schemas";
import { pathResolve } from "../io";
import { ElectronDialog, ElectronShell } from "../platform/electron";
import { BackendClock } from "../runtime";
import { Git } from "../services/git";
import { RegistryStore } from "../services/registry";
import { Storage } from "../storage";

type SpawnedEditorProcess = {
  once: {
    (event: "spawn", listener: () => void): SpawnedEditorProcess;
    (event: "error", listener: (error: Error) => void): SpawnedEditorProcess;
  };
  unref: () => unknown;
};

type SpawnEditorProcess = (command: string, args: readonly string[]) => SpawnedEditorProcess;

export const projectEditorCommands: Record<ProjectEditorId, string> = {
  vscode: "code",
  cursor: "cursor"
};

const projectEditorLabels: Record<ProjectEditorId, string> = {
  vscode: "VS Code",
  cursor: "Cursor"
};

const isProjectEditorId = (value: unknown): value is ProjectEditorId =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(projectEditorCommands, value);

type ProjectEditorLaunch = {
  readonly projectPath: string;
  readonly editorId: ProjectEditorId;
  readonly command: string;
  readonly editorLabel: string;
};

const resolveProjectEditorLaunch = (input: ProjectOpenInEditorInput): ProjectEditorLaunch | ProjectOpenInEditorResult => {
  const projectPath = typeof input.projectPath === "string" ? input.projectPath.trim() : "";
  if (!projectPath) {
    return { ok: false, message: "Relay could not open the project because the project path is empty." };
  }
  if (!isProjectEditorId(input.editorId)) {
    return { ok: false, message: "Relay could not open the project because the selected editor is not supported." };
  }

  return {
    projectPath,
    editorId: input.editorId,
    command: projectEditorCommands[input.editorId],
    editorLabel: projectEditorLabels[input.editorId]
  };
};

const isProjectEditorLaunch = (value: ProjectEditorLaunch | ProjectOpenInEditorResult): value is ProjectEditorLaunch =>
  "command" in value;

export const listProjects = () =>
  Effect.gen(function*() {
    const registry = yield* RegistryStore.use((store) => store.read());
    const storage = yield* Storage;
    return yield* Effect.all(
      [...registry.projects]
        .sort((a, b) => a.sidebarPosition - b.sidebarPosition)
        .map((project) => storage.getProjectSummary(project.path, project.lastOpenedAt))
    );
  });

export const addProjectFolder = () =>
  Effect.gen(function*() {
    const dialog = yield* ElectronDialog;
    const storage = yield* Storage;
    const clock = yield* BackendClock;
    const result = yield* dialog.showOpenDialog({
      title: "Add Relay Project",
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const projectPath = pathResolve(result.filePaths[0]);
    const summary = yield* storage.getProjectSummary(projectPath);
    let initialized = false;

    if (!summary.relayInitialized) {
      const confirm = yield* dialog.showMessageBox({
        type: "question",
        buttons: ["Initialize", "Cancel"],
        defaultId: 0,
        cancelId: 1,
        title: "Initialize Relay Project",
        message: "Relay needs to create a .relay folder in this project.",
        detail: projectPath
      });
      if (confirm.response !== 0) return null;
      yield* storage.initializeProject(projectPath);
      initialized = true;
    }

    yield* RegistryStore.use((store) => store.upsertProjectPath(projectPath));
    return {
      project: yield* storage.getProjectSummary(projectPath, clock.nowIso()),
      initialized
    };
  });

export const removeProjectFromSidebar = (projectPath: string) =>
  Effect.gen(function*() {
    yield* RegistryStore.use((store) => store.removeProjectPath(projectPath));
    return yield* listProjects();
  });

export const readProject = (projectPath: string) =>
  Storage.use((storage) => storage.getProjectSummary(projectPath));

export const readProjectGitMetadata = (projectPath: string, options: { force?: boolean } = {}) =>
  Git.use((git) => git.readCachedMetadata(projectPath, options));

export const revealProjectInFinder = (projectPath: string) =>
  ElectronShell.use((shell) => shell.openPath(projectPath));

export const openProjectInEditorEffect = (
  input: ProjectOpenInEditorInput,
  spawnEditorProcess: SpawnEditorProcess
): Effect.Effect<ProjectOpenInEditorResult, unknown> =>
  Effect.tryPromise({
    try: async () => {
      const launch = resolveProjectEditorLaunch(input);
      if (!isProjectEditorLaunch(launch)) return launch;

      return await new Promise<ProjectOpenInEditorResult>((resolve) => {
        let settled = false;
        const settle = (result: ProjectOpenInEditorResult): void => {
          if (settled) return;
          settled = true;
          resolve(result);
        };

        try {
          const child = spawnEditorProcess(launch.command, [launch.projectPath]);
          child.once("spawn", () => {
            child.unref();
            settle({ ok: true });
          });
          child.once("error", (error) => {
            settle({
              ok: false,
              message: `Relay could not open this project in ${launch.editorLabel}. Make sure the \`${launch.command}\` command is available on your PATH. ${
                error.message
              }`
            });
          });
        } catch (error) {
          const detail = error instanceof Error ? error.message : "Unknown launch error.";
          settle({
            ok: false,
            message: `Relay could not open this project in ${launch.editorLabel}. Make sure the \`${launch.command}\` command is available on your PATH. ${detail}`
          });
        }
      });
    },
    catch: (cause) => cause
  });

export const openProjectInEditorWorkflow = (input: ProjectOpenInEditorInput) =>
  Effect.gen(function*() {
    const launch = resolveProjectEditorLaunch(input);
    if (!isProjectEditorLaunch(launch)) return launch;

    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    return yield* Effect.scoped(
      Effect.gen(function*() {
        const handle = yield* spawner.spawn(
          ChildProcess.make(launch.command, [launch.projectPath], {
            detached: true,
            stdin: "ignore",
            stdout: "ignore",
            stderr: "ignore"
          })
        );
        yield* handle.unref;
        return { ok: true } satisfies ProjectOpenInEditorResult;
      })
    ).pipe(
      Effect.catch((error) =>
        Effect.succeed({
          ok: false,
          message: `Relay could not open this project in ${launch.editorLabel}. Make sure the \`${launch.command}\` command is available on your PATH. ${
            error instanceof Error ? error.message : "Unknown launch error."
          }`
        } satisfies ProjectOpenInEditorResult)
      )
    );
  });

export const openProjectInEditor = (
  input: ProjectOpenInEditorInput,
  spawnEditorProcess: SpawnEditorProcess
): Promise<ProjectOpenInEditorResult> => Effect.runPromise(openProjectInEditorEffect(input, spawnEditorProcess));
