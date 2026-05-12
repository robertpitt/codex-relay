import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import type { ReactElement, ReactNode } from "react";

export type ShortcutDirection = "next" | "previous";

export type KeyboardShortcutEvent = Pick<
  KeyboardEvent,
  | "altKey"
  | "code"
  | "ctrlKey"
  | "defaultPrevented"
  | "isComposing"
  | "key"
  | "metaKey"
  | "preventDefault"
  | "repeat"
  | "shiftKey"
  | "stopPropagation"
  | "target"
>;

export type ShortcutHandlerResult = boolean | void;

export type KeyboardShortcutRegistration = {
  id: string;
  enabled?: boolean;
  priority?: number;
  allowInTextEntry?: boolean;
  matcher: (event: KeyboardShortcutEvent) => boolean;
  handler: (event: KeyboardShortcutEvent) => ShortcutHandlerResult;
};

export type OverlayShortcutRegistration = {
  id: string;
  enabled?: boolean;
  priority?: number;
  onEscape: (event: KeyboardShortcutEvent) => ShortcutHandlerResult;
};

type RuntimeRegistration<T> = {
  order: number;
  getRegistration: () => T;
};

type RuntimeShortcutRegistration = RuntimeRegistration<KeyboardShortcutRegistration>;
type RuntimeOverlayRegistration = RuntimeRegistration<OverlayShortcutRegistration>;

type KeyboardShortcutContextValue = {
  registerShortcut: (registration: Omit<RuntimeShortcutRegistration, "order">) => () => void;
  registerOverlay: (registration: Omit<RuntimeOverlayRegistration, "order">) => () => void;
};

type OrderedShortcut = KeyboardShortcutRegistration & { order: number; priority: number };
type OrderedOverlay = OverlayShortcutRegistration & { order: number; priority: number };

const nonTextInputTypes = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit"
]);

const KeyboardShortcutContext = createContext<KeyboardShortcutContextValue | null>(null);

const isEnabled = (enabled: boolean | undefined): boolean => enabled !== false;

const normalizeKey = (key: string): string => key.toLowerCase();

const hasOnlyModifier = (event: KeyboardShortcutEvent, modifier: "commandOrControl" | "none"): boolean => {
  if (event.altKey || event.shiftKey) return false;
  if (modifier === "none") return !event.ctrlKey && !event.metaKey;
  return event.ctrlKey !== event.metaKey;
};

const isSpaceKey = (event: KeyboardShortcutEvent): boolean =>
  event.code === "Space" || event.key === " " || event.key === "Spacebar";

const isMacPlatform = (platform: string): boolean => /Mac|iPhone|iPad|iPod/i.test(platform);

export const createTicketShortcutLabel = (
  platform = typeof navigator === "undefined" ? "" : navigator.platform
): string => (isMacPlatform(platform) ? "⌘ Space" : "Ctrl Space");

export const sidebarToggleShortcutLabel = (
  platform = typeof navigator === "undefined" ? "" : navigator.platform
): string => (isMacPlatform(platform) ? "⌘ B" : "Ctrl B");

export const ticketNavigationShortcutLabel = "Arrow keys or J/K";

export const isTextEntryTarget = (target: EventTarget | null): boolean => {
  if (!target || typeof target !== "object") return false;

  const candidate = target as {
    tagName?: string;
    type?: string;
    isContentEditable?: boolean;
    getAttribute?: (name: string) => string | null;
    closest?: (selector: string) => unknown;
  };

  if (candidate.isContentEditable) return true;
  if (candidate.getAttribute?.("contenteditable") === "true" || candidate.getAttribute?.("contenteditable") === "") return true;
  if (candidate.closest?.("[contenteditable='true'], [contenteditable='']")) return true;
  if (candidate.getAttribute?.("role") === "textbox") return true;

  const tagName = candidate.tagName?.toLowerCase();
  if (tagName === "textarea" || tagName === "select") return true;
  if (tagName !== "input") return false;

  return !nonTextInputTypes.has((candidate.type ?? "text").toLowerCase());
};

export const isCreateTicketShortcut = (event: KeyboardShortcutEvent): boolean =>
  !event.repeat && isSpaceKey(event) && hasOnlyModifier(event, "commandOrControl");

export const isSidebarToggleShortcut = (event: KeyboardShortcutEvent): boolean =>
  !event.repeat && normalizeKey(event.key) === "b" && hasOnlyModifier(event, "commandOrControl");

export const ticketNavigationDirection = (event: KeyboardShortcutEvent): ShortcutDirection | null => {
  if (!hasOnlyModifier(event, "none")) return null;

  switch (normalizeKey(event.key)) {
    case "arrowright":
    case "arrowdown":
    case "j":
      return "next";
    case "arrowleft":
    case "arrowup":
    case "k":
      return "previous";
    default:
      return null;
  }
};

const byPriorityThenOrder = <T extends { priority: number; order: number }>(left: T, right: T): number =>
  left.priority === right.priority ? left.order - right.order : left.priority - right.priority;

export const handleKeyboardShortcutKeyDown = (
  event: KeyboardShortcutEvent,
  shortcuts: OrderedShortcut[],
  overlays: OrderedOverlay[]
): boolean => {
  if (event.defaultPrevented || event.isComposing) return false;

  if (event.key === "Escape" || event.key === "Esc") {
    const topmostOverlay = overlays.filter((overlay) => isEnabled(overlay.enabled)).sort(byPriorityThenOrder).at(-1);
    if (!topmostOverlay) return false;

    const handled = topmostOverlay.onEscape(event);
    if (handled === false) return false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  const textEntryTarget = isTextEntryTarget(event.target);
  const orderedShortcuts = shortcuts
    .filter((shortcut) => isEnabled(shortcut.enabled))
    .sort((left, right) => byPriorityThenOrder(right, left));

  for (const shortcut of orderedShortcuts) {
    if (textEntryTarget && !shortcut.allowInTextEntry) continue;
    if (!shortcut.matcher(event)) continue;

    const handled = shortcut.handler(event);
    if (handled === false) continue;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  return false;
};

export function KeyboardShortcutProvider({ children }: { children: ReactNode }): ReactElement {
  const shortcutsRef = useRef<RuntimeShortcutRegistration[]>([]);
  const overlaysRef = useRef<RuntimeOverlayRegistration[]>([]);
  const nextOrderRef = useRef(0);

  const registerShortcut = useCallback((registration: Omit<RuntimeShortcutRegistration, "order">): (() => void) => {
    const entry = { ...registration, order: nextOrderRef.current };
    nextOrderRef.current += 1;
    shortcutsRef.current = [...shortcutsRef.current, entry];
    return () => {
      shortcutsRef.current = shortcutsRef.current.filter((shortcut) => shortcut !== entry);
    };
  }, []);

  const registerOverlay = useCallback((registration: Omit<RuntimeOverlayRegistration, "order">): (() => void) => {
    const entry = { ...registration, order: nextOrderRef.current };
    nextOrderRef.current += 1;
    overlaysRef.current = [...overlaysRef.current, entry];
    return () => {
      overlaysRef.current = overlaysRef.current.filter((overlay) => overlay !== entry);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const shortcuts = shortcutsRef.current.map((shortcut) => {
        const registration = shortcut.getRegistration();
        return { ...registration, priority: registration.priority ?? 0, order: shortcut.order };
      });
      const overlays = overlaysRef.current.map((overlay) => {
        const registration = overlay.getRegistration();
        return { ...registration, priority: registration.priority ?? 0, order: overlay.order };
      });

      handleKeyboardShortcutKeyDown(event, shortcuts, overlays);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo(
    () => ({
      registerShortcut,
      registerOverlay
    }),
    [registerOverlay, registerShortcut]
  );

  return <KeyboardShortcutContext.Provider value={value}>{children}</KeyboardShortcutContext.Provider>;
}

export const useKeyboardShortcut = (registration: KeyboardShortcutRegistration): void => {
  const context = useContext(KeyboardShortcutContext);
  const registrationRef = useRef(registration);
  registrationRef.current = registration;

  useEffect(() => {
    if (!context) return undefined;
    return context.registerShortcut({ getRegistration: () => registrationRef.current });
  }, [context, registration.id]);
};

export const useShortcutOverlay = (registration: OverlayShortcutRegistration): void => {
  const context = useContext(KeyboardShortcutContext);
  const registrationRef = useRef(registration);
  registrationRef.current = registration;

  useEffect(() => {
    if (!context) return undefined;
    return context.registerOverlay({ getRegistration: () => registrationRef.current });
  }, [context, registration.id]);
};
