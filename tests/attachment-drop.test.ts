import test from "node:test";
import assert from "node:assert/strict";
import {
  attachmentMarkdownBlock,
  insertMarkdownAtSelection,
  isSupportedDroppedImageFile
} from "../src/renderer/src/lib/attachments";

test("ticket markdown image drop helpers accept image MIME types or known image extensions", () => {
  assert.equal(isSupportedDroppedImageFile({ name: "screenshot.png", type: "" } as Pick<File, "name" | "type">), true);
  assert.equal(isSupportedDroppedImageFile({ name: "pasted-image", type: "image/png" } as Pick<File, "name" | "type">), true);
  assert.equal(isSupportedDroppedImageFile({ name: "notes.txt", type: "text/plain" } as Pick<File, "name" | "type">), false);
});

test("ticket markdown image drop helpers insert Markdown references at the editor selection", () => {
  const block = attachmentMarkdownBlock([
    {
      fileName: "screen [1].png",
      markdownPath: ".relay/attachments/screen-1.png",
      absolutePath: "/project/.relay/attachments/screen-1.png"
    },
    {
      fileName: "error.png",
      markdownPath: ".relay/attachments/error.png",
      absolutePath: "/project/.relay/attachments/error.png"
    }
  ]);
  const result = insertMarkdownAtSelection("Before\nAfter", block, "Before\n".length);

  assert.equal(
    result.value,
    "Before\n![screen \\[1\\].png](.relay/attachments/screen-1.png)\n![error.png](.relay/attachments/error.png)\nAfter"
  );
  assert.equal(result.cursor, "Before\n![screen \\[1\\].png](.relay/attachments/screen-1.png)\n![error.png](.relay/attachments/error.png)\n".length);
});
