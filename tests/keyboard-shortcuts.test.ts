import test from "node:test";
import assert from "node:assert/strict";
import {
  handleKeyboardShortcutKeyDown,
  isCreateTicketShortcut,
  isSidebarToggleShortcut,
  isTicketComposerSubmitShortcut,
  isTextEntryTarget,
  sidebarToggleShortcutLabel,
  ticketNavigationDirection,
  type KeyboardShortcutEvent,
  type ShortcutDirection
} from "../src/renderer/src/lib/keyboardShortcuts";

type FakeKeyboardShortcutEvent = KeyboardShortcutEvent & {
  prevented: boolean;
  stopped: boolean;
};

const target = (value: Record<string, unknown>): EventTarget => value as unknown as EventTarget;

const keyboardEvent = (patch: Partial<KeyboardShortcutEvent>): FakeKeyboardShortcutEvent => {
  let defaultPrevented = patch.defaultPrevented ?? false;
  let event: FakeKeyboardShortcutEvent;
  event = {
    altKey: patch.altKey ?? false,
    code: patch.code ?? "",
    ctrlKey: patch.ctrlKey ?? false,
    get defaultPrevented() {
      return defaultPrevented;
    },
    isComposing: patch.isComposing ?? false,
    key: patch.key ?? "",
    metaKey: patch.metaKey ?? false,
    repeat: patch.repeat ?? false,
    shiftKey: patch.shiftKey ?? false,
    target: patch.target ?? null,
    prevented: false,
    stopped: false,
    preventDefault() {
      defaultPrevented = true;
      event.prevented = true;
    },
    stopPropagation() {
      event.stopped = true;
    }
  } satisfies FakeKeyboardShortcutEvent;

  return event;
};

test("Escape dispatches only to the topmost enabled overlay", () => {
  const calls: string[] = [];
  const event = keyboardEvent({ key: "Escape" });

  const handled = handleKeyboardShortcutKeyDown(
    event,
    [],
    [
      {
        id: "ticket-detail",
        order: 1,
        priority: 20,
        onEscape: () => {
          calls.push("detail");
          return true;
        }
      },
      {
        id: "agent-log",
        order: 2,
        priority: 110,
        onEscape: () => {
          calls.push("log");
          return true;
        }
      }
    ]
  );

  assert.equal(handled, true);
  assert.deepEqual(calls, ["log"]);
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
});

test("Escape handlers can preserve unsaved overlay input without falling through", () => {
  let closed = false;
  let warned = false;
  const event = keyboardEvent({ key: "Escape", target: target({ tagName: "TEXTAREA" }) });

  const handled = handleKeyboardShortcutKeyDown(
    event,
    [],
    [
      {
        id: "create-ticket",
        order: 1,
        priority: 100,
        onEscape: () => {
          warned = true;
          return true;
        }
      },
      {
        id: "ticket-detail",
        order: 2,
        priority: 20,
        onEscape: () => {
          closed = true;
          return true;
        }
      }
    ]
  );

  assert.equal(handled, true);
  assert.equal(warned, true);
  assert.equal(closed, false);
});

test("draft ticket shortcut focuses composer from non-typing contexts", () => {
  let focusCount = 0;
  const event = keyboardEvent({ key: " ", code: "Space", metaKey: true });

  const handled = handleKeyboardShortcutKeyDown(
    event,
    [
      {
        id: "create-ticket",
        order: 1,
        priority: 10,
        matcher: isCreateTicketShortcut,
        handler: () => {
          focusCount += 1;
          return true;
        }
      }
    ],
    []
  );

  assert.equal(handled, true);
  assert.equal(focusCount, 1);
  assert.equal(isCreateTicketShortcut(keyboardEvent({ key: " ", code: "Space", ctrlKey: true })), true);
});

test("Ticket composer submit shortcut uses command-or-control Enter only", () => {
  assert.equal(isTicketComposerSubmitShortcut(keyboardEvent({ key: "Enter", metaKey: true })), true);
  assert.equal(isTicketComposerSubmitShortcut(keyboardEvent({ key: "Enter", ctrlKey: true })), true);
  assert.equal(isTicketComposerSubmitShortcut(keyboardEvent({ key: "Enter" })), false);
  assert.equal(isTicketComposerSubmitShortcut(keyboardEvent({ key: "Enter", metaKey: true, shiftKey: true })), false);
  assert.equal(isTicketComposerSubmitShortcut(keyboardEvent({ key: "Enter", metaKey: true, ctrlKey: true })), false);
  assert.equal(isTicketComposerSubmitShortcut(keyboardEvent({ key: "Enter", metaKey: true, repeat: true })), false);
});

test("Sidebar toggle shortcut matches command-or-control B without extra modifiers", () => {
  assert.equal(isSidebarToggleShortcut(keyboardEvent({ key: "b", metaKey: true })), true);
  assert.equal(isSidebarToggleShortcut(keyboardEvent({ key: "B", ctrlKey: true })), true);
  assert.equal(isSidebarToggleShortcut(keyboardEvent({ key: "b", metaKey: true, repeat: true })), false);
  assert.equal(isSidebarToggleShortcut(keyboardEvent({ key: "b", metaKey: true, altKey: true })), false);
  assert.equal(isSidebarToggleShortcut(keyboardEvent({ key: "b", ctrlKey: true, shiftKey: true })), false);
  assert.equal(isSidebarToggleShortcut(keyboardEvent({ key: "b", ctrlKey: true, metaKey: true })), false);
  assert.equal(isSidebarToggleShortcut(keyboardEvent({ key: "i", metaKey: true })), false);
});

test("Sidebar toggle shortcut labels follow the platform command key", () => {
  assert.equal(sidebarToggleShortcutLabel("MacIntel"), "\u2318 B");
  assert.equal(sidebarToggleShortcutLabel("Win32"), "Ctrl B");
  assert.equal(sidebarToggleShortcutLabel("Linux x86_64"), "Ctrl B");
});

test("Sidebar toggle shortcut dispatch ignores text entry targets by default", () => {
  let toggleCount = 0;
  const textEvent = keyboardEvent({ key: "b", metaKey: true, target: target({ tagName: "INPUT", type: "text" }) });
  const handledText = handleKeyboardShortcutKeyDown(
    textEvent,
    [
      {
        id: "toggle-sidebar",
        order: 1,
        priority: 0,
        matcher: isSidebarToggleShortcut,
        handler: () => {
          toggleCount += 1;
          return true;
        }
      }
    ],
    []
  );

  assert.equal(handledText, false);
  assert.equal(toggleCount, 0);
  assert.equal(textEvent.prevented, false);
  assert.equal(textEvent.stopped, false);

  const buttonEvent = keyboardEvent({ key: "b", metaKey: true, target: target({ tagName: "BUTTON" }) });
  const handledButton = handleKeyboardShortcutKeyDown(
    buttonEvent,
    [
      {
        id: "toggle-sidebar",
        order: 1,
        priority: 0,
        matcher: isSidebarToggleShortcut,
        handler: () => {
          toggleCount += 1;
          return true;
        }
      }
    ],
    []
  );

  assert.equal(handledButton, true);
  assert.equal(toggleCount, 1);
  assert.equal(buttonEvent.prevented, true);
  assert.equal(buttonEvent.stopped, true);
});

test("draft ticket shortcut and ticket navigation ignore text entry targets", () => {
  const typingTargets = [
    target({ tagName: "INPUT", type: "text" }),
    target({ tagName: "TEXTAREA" }),
    target({ tagName: "SELECT" }),
    target({ isContentEditable: true }),
    target({ tagName: "DIV", getAttribute: (name: string) => (name === "role" ? "textbox" : null) })
  ];

  for (const typingTarget of typingTargets) {
    let composerFocused = false;
    let navigated = false;
    const createEvent = keyboardEvent({ key: " ", code: "Space", metaKey: true, target: typingTarget });
    const navigationEvent = keyboardEvent({ key: "j", target: typingTarget });

    handleKeyboardShortcutKeyDown(
      createEvent,
      [
        {
          id: "create-ticket",
          order: 1,
          priority: 10,
          matcher: isCreateTicketShortcut,
          handler: () => {
            composerFocused = true;
            return true;
          }
        }
      ],
      []
    );
    handleKeyboardShortcutKeyDown(
      navigationEvent,
      [
        {
          id: "ticket-navigation",
          order: 1,
          priority: 0,
          matcher: (event) => ticketNavigationDirection(event) !== null,
          handler: () => {
            navigated = true;
            return true;
          }
        }
      ],
      []
    );

    assert.equal(composerFocused, false);
    assert.equal(navigated, false);
    assert.equal(createEvent.prevented, false);
    assert.equal(navigationEvent.prevented, false);
    assert.equal(isTextEntryTarget(typingTarget), true);
  }
});

test("Ticket navigation uses Arrow and J/K shortcuts while preserving Tab", () => {
  assert.equal(ticketNavigationDirection(keyboardEvent({ key: "ArrowDown" })), "next");
  assert.equal(ticketNavigationDirection(keyboardEvent({ key: "ArrowRight" })), "next");
  assert.equal(ticketNavigationDirection(keyboardEvent({ key: "j" })), "next");
  assert.equal(ticketNavigationDirection(keyboardEvent({ key: "ArrowUp" })), "previous");
  assert.equal(ticketNavigationDirection(keyboardEvent({ key: "ArrowLeft" })), "previous");
  assert.equal(ticketNavigationDirection(keyboardEvent({ key: "k" })), "previous");
  assert.equal(ticketNavigationDirection(keyboardEvent({ key: "Tab" })), null);

  let direction: ShortcutDirection | null = null;
  const event = keyboardEvent({ key: "j" });
  const handled = handleKeyboardShortcutKeyDown(
    event,
    [
      {
        id: "ticket-navigation",
        order: 1,
        priority: 0,
        matcher: (shortcutEvent) => ticketNavigationDirection(shortcutEvent) !== null,
        handler: (shortcutEvent) => {
          direction = ticketNavigationDirection(shortcutEvent);
          return true;
        }
      }
    ],
    []
  );

  assert.equal(handled, true);
  assert.equal(direction, "next");
});
