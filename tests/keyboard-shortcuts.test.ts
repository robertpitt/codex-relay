import test from "node:test";
import assert from "node:assert/strict";
import {
  handleKeyboardShortcutKeyDown,
  isCreateTicketShortcut,
  isTextEntryTarget,
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

test("Create Ticket shortcut opens from non-typing contexts", () => {
  let openCount = 0;
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
          openCount += 1;
          return true;
        }
      }
    ],
    []
  );

  assert.equal(handled, true);
  assert.equal(openCount, 1);
  assert.equal(isCreateTicketShortcut(keyboardEvent({ key: " ", code: "Space", ctrlKey: true })), true);
});

test("Create Ticket shortcut and ticket navigation ignore text entry targets", () => {
  const typingTargets = [
    target({ tagName: "INPUT", type: "text" }),
    target({ tagName: "TEXTAREA" }),
    target({ tagName: "SELECT" }),
    target({ isContentEditable: true }),
    target({ tagName: "DIV", getAttribute: (name: string) => (name === "role" ? "textbox" : null) })
  ];

  for (const typingTarget of typingTargets) {
    let createOpened = false;
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
            createOpened = true;
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

    assert.equal(createOpened, false);
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
