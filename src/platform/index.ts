import { Layer } from "effect";
import { BackendPlatformLive } from "./BackendPlatform";
import { BrowserWindowsLive } from "./BrowserWindows";
import { ElectronAppLive } from "./ElectronApp";
import { ElectronDialogLive } from "./ElectronDialog";
import { ElectronShellLive } from "./ElectronShell";
import { ElectronWindowLive } from "./ElectronWindow";
import { ProcessLifecycleLive } from "./ProcessLifecycle";

export const ElectronAppServiceLive = ElectronAppLive.pipe(Layer.provide(ProcessLifecycleLive));

export const ElectronWindowDependenciesLive = Layer.mergeAll(BrowserWindowsLive, ElectronAppServiceLive);

export const ElectronWindowServiceLive = ElectronWindowLive.pipe(Layer.provide(ElectronWindowDependenciesLive));

export const ElectronDesktopLive = Layer.mergeAll(
  ElectronAppServiceLive,
  ElectronWindowServiceLive,
  ElectronDialogLive,
  ElectronShellLive
).pipe(Layer.provide(BackendPlatformLive));

export const PlatformLive = Layer.mergeAll(BackendPlatformLive, ElectronDesktopLive);
export const ElectronPlatformLive = PlatformLive;

export * from "./BackendPlatform";
export * from "./Clock";
export * from "./BrowserWindows";
export * from "./ElectronApp";
export * from "./ElectronDialog";
export * from "./ElectronShell";
export * from "./ElectronWindow";
export * from "./Errors";
export * from "./fetch";
export * from "./PlatformError";
export * from "./ProcessLifecycle";
