import { ManagedRuntime } from "effect";
import { ElectronAppLive, ElectronDialogLive, ElectronIpcLive, ElectronShellLive, ElectronWindowLive } from "../../electron";
import { RelayIpcLive } from "../../ipc";
import { RelayWindowLive } from "../../window/RelayWindow";
import { BackendLoggerLive } from "../logger";
import { GitServiceLive } from "../git";
import { BackendKernelLive } from "../kernel";
import { RegistryStoreLive } from "../registry";
import { RunEventSinkLive } from "../run-events";
import { StorageLive } from "../storage";
import { BackendServicesBaseLive, configureBackendRuntime, disposeBackendRuntime } from ".";
import { Layer } from "effect";
import { IoLive } from "../io";

const ElectronDesktopLive = Layer.mergeAll(
  ElectronAppLive,
  ElectronWindowLive,
  ElectronDialogLive,
  ElectronShellLive,
  ElectronIpcLive
);

export const AppLayerLive = Layer.mergeAll(
  BackendServicesBaseLive,
  IoLive,
  ElectronDesktopLive,
  RelayIpcLive.pipe(Layer.provide(ElectronDesktopLive)),
  RelayWindowLive.pipe(Layer.provide(ElectronDesktopLive)),
  BackendLoggerLive,
  GitServiceLive,
  RegistryStoreLive,
  BackendKernelLive,
  StorageLive.pipe(Layer.provide(BackendServicesBaseLive)),
  RunEventSinkLive
);

export const installAppRuntime = (): void => {
  configureBackendRuntime(ManagedRuntime.make(AppLayerLive));
  runtimeDisposed = false;
};

let runtimeDisposed = false;

export const disposeAppRuntime = async (): Promise<void> => {
  if (runtimeDisposed) return;
  runtimeDisposed = true;
  await disposeBackendRuntime();
};
