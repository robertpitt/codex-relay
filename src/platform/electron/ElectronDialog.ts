import { dialog, type MessageBoxOptions, type MessageBoxReturnValue, type OpenDialogOptions, type OpenDialogReturnValue } from "electron";
import { Context, Effect, Layer } from "effect";
import { currentMainWindow } from "./ElectronWindow";
import { electronError, type ElectronError } from "./Errors";

export type ElectronOpenDialogOptions = OpenDialogOptions;
export type ElectronOpenDialogResult = OpenDialogReturnValue;
export type ElectronMessageBoxOptions = MessageBoxOptions;
export type ElectronMessageBoxResult = MessageBoxReturnValue;

export type ElectronDialogService = {
  readonly showOpenDialog: (options: ElectronOpenDialogOptions) => Effect.Effect<ElectronOpenDialogResult, ElectronError>;
  readonly showMessageBox: (options: ElectronMessageBoxOptions) => Effect.Effect<ElectronMessageBoxResult, ElectronError>;
};

export const ElectronDialog = Context.Service<ElectronDialogService>("relay/ElectronDialog");

export const ElectronDialogLive = Layer.succeed(ElectronDialog)({
  showOpenDialog: (options) =>
    Effect.tryPromise({
      try: () => {
        const window = currentMainWindow();
        return window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options);
      },
      catch: (cause) => electronError("dialog.showOpenDialog", cause)
    }),
  showMessageBox: (options) =>
    Effect.tryPromise({
      try: () => {
        const window = currentMainWindow();
        return window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options);
      },
      catch: (cause) => electronError("dialog.showMessageBox", cause)
    })
});
