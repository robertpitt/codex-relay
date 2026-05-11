import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MarkdownBlock,
  copyCodeBlockSource,
  copyMarkdownSource,
  parseMarkdownBlocks,
  type ClipboardWriter
} from "../src/renderer/src/components/MarkdownBlock";

const flushPromises = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

type ElementWithChildren = React.ReactElement<{ children?: React.ReactNode }>;
type ButtonElement = React.ReactElement<{
  children?: React.ReactNode;
  "aria-label"?: string;
  onClick?: () => void;
}>;

const collectButtons = (node: React.ReactNode, buttons: ButtonElement[] = []): ButtonElement[] => {
  if (Array.isArray(node)) {
    node.forEach((child) => collectButtons(child, buttons));
    return buttons;
  }
  if (!React.isValidElement(node)) return buttons;
  const element = node as ElementWithChildren;
  if (element.type === "button") buttons.push(element as ButtonElement);
  collectButtons(element.props.children, buttons);
  return buttons;
};

test("markdown block renders representative Markdown syntax", () => {
  const markup = renderToStaticMarkup(
    <MarkdownBlock
      title="Preview"
      source={`# Heading

Paragraph with **bold**, *emphasis*, \`inline code\`, and [a link](https://example.com).

- Alpha
- Beta

1. First
2. Second

> Quoted text

\`\`\`ts
const answer = 42;
\`\`\`

| Name | Value |
| --- | --- |
| Status | Done |`}
    />
  );

  assert.match(markup, /<h1>Heading<\/h1>/);
  assert.match(markup, /<strong>bold<\/strong>/);
  assert.match(markup, /<em>emphasis<\/em>/);
  assert.match(markup, /<code>inline code<\/code>/);
  assert.match(markup, /href="https:\/\/example\.com"/);
  assert.match(markup, /<ul>/);
  assert.match(markup, /<ol>/);
  assert.match(markup, /<blockquote>/);
  assert.match(markup, /<pre><code class="language-ts">const answer = 42;<\/code><\/pre>/);
  assert.match(markup, /<table>/);
  assert.match(markup, /<th>Name<\/th>/);
  assert.match(markup, /<td>Done<\/td>/);
});

test("markdown block escapes raw HTML and blocks unsafe links", () => {
  const markup = renderToStaticMarkup(
    <MarkdownBlock
      source={`<script>alert("xss")</script>

[bad link](javascript:alert("xss"))

<img src=x onerror=alert("xss")>`}
    />
  );

  assert.doesNotMatch(markup, /<script/i);
  assert.doesNotMatch(markup, /<img/i);
  assert.doesNotMatch(markup, /href="javascript:/i);
  assert.match(markup, /&lt;script&gt;alert/);
  assert.match(markup, /class="markdown-link-unsafe"/);
});

test("copy helpers preserve markdown source and code block contents", async () => {
  const written: string[] = [];
  const clipboard: ClipboardWriter = {
    writeText: async (text) => {
      written.push(text);
    }
  };

  await copyMarkdownSource("**source**", clipboard);
  await copyCodeBlockSource("const answer = 42;", clipboard);

  assert.deepEqual(written, ["**source**", "const answer = 42;"]);
});

test("markdown block copy buttons copy source and code without fences", async () => {
  const source = "Before\n\n```ts\nconst answer = 42;\n```";
  const written: string[] = [];
  const copiedKinds: string[] = [];
  const clipboard: ClipboardWriter = {
    writeText: async (text) => {
      written.push(text);
    }
  };

  const element = MarkdownBlock({
    source,
    clipboard,
    onCopied: (kind) => copiedKinds.push(kind)
  });
  const buttons = collectButtons(element);

  const markdownCopyButton = buttons.find((button) => button.props["aria-label"] === "Copy Markdown source");
  const codeCopyButton = buttons.find((button) => button.props["aria-label"] === "Copy code block");
  assert.ok(markdownCopyButton);
  assert.ok(codeCopyButton);

  markdownCopyButton.props.onClick?.();
  codeCopyButton.props.onClick?.();
  await flushPromises();

  assert.deepEqual(written, [source, "const answer = 42;"]);
  assert.deepEqual(copiedKinds, ["markdown", "code"]);

  const codeBlock = parseMarkdownBlocks(source).find((block) => block.type === "code");
  assert.deepEqual(codeBlock, { type: "code", language: "ts", code: "const answer = 42;" });
});
