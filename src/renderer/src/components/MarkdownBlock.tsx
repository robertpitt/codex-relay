import clsx from "clsx";
import { Copy } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

export type ClipboardWriter = {
  writeText: (text: string) => Promise<void> | void;
};

type MarkdownNode =
  | { type: "paragraph"; lines: string[] }
  | { type: "heading"; depth: number; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "blockquote"; children: MarkdownNode[] }
  | { type: "code"; language: string | null; code: string }
  | { type: "table"; headers: string[]; rows: string[][] };

type CopyKind = "markdown" | "code";

type MarkdownBlockProps = {
  source: string;
  title?: string;
  className?: string;
  compact?: boolean;
  showCopy?: boolean;
  clipboard?: ClipboardWriter;
  onCopied?: (kind: CopyKind) => void;
  onCopyError?: (error: unknown) => void;
};

const safeLinkProtocols = new Set(["http:", "https:", "mailto:"]);

const normalizeMarkdown = (source: string): string => source.replace(/\r\n?/g, "\n");

const getClipboard = (clipboard?: ClipboardWriter): ClipboardWriter => {
  if (clipboard) return clipboard;
  if (typeof navigator !== "undefined" && navigator.clipboard) return navigator.clipboard;
  throw new Error("Clipboard is unavailable.");
};

const writeClipboardText = async (text: string, clipboard?: ClipboardWriter): Promise<void> => {
  await getClipboard(clipboard).writeText(text);
};

export const copyMarkdownSource = (source: string, clipboard?: ClipboardWriter): Promise<void> => writeClipboardText(source, clipboard);

export const copyCodeBlockSource = (code: string, clipboard?: ClipboardWriter): Promise<void> => writeClipboardText(code, clipboard);

export const sanitizeMarkdownLink = (href: string): string | null => {
  const value = href.trim();
  if (!value) return null;

  const compactValue = value.replace(/[\u0000-\u001f\u007f\s]+/g, "").toLowerCase();
  if (/^(javascript|data|vbscript):/.test(compactValue)) return null;

  if (/^(#|\/|\.\/|\.\.\/)/.test(value)) return value;

  try {
    const parsed = new URL(value);
    return safeLinkProtocols.has(parsed.protocol) ? value : null;
  } catch {
    return null;
  }
};

const sanitizeLanguage = (language: string): string | null => {
  const safeLanguage = language.trim().split(/\s+/)[0]?.replace(/[^\w#+.-]/g, "") ?? "";
  return safeLanguage.length > 0 ? safeLanguage : null;
};

const parseFenceStart = (line: string): { marker: "`" | "~"; size: number; language: string | null } | null => {
  const match = line.match(/^\s{0,3}(`{3,}|~{3,})\s*(.*?)\s*$/);
  if (!match) return null;
  const fence = match[1];
  return {
    marker: fence[0] as "`" | "~",
    size: fence.length,
    language: sanitizeLanguage(match[2] ?? "")
  };
};

const isFenceEnd = (line: string, marker: "`" | "~", size: number): boolean => {
  const match = line.match(/^\s{0,3}(`{3,}|~{3,})\s*$/);
  return Boolean(match && match[1].startsWith(marker) && match[1].length >= size);
};

const parseHeading = (line: string): { depth: number; text: string } | null => {
  const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
  if (!match) return null;
  return { depth: match[1].length, text: match[2] };
};

const parseListItem = (line: string): { ordered: boolean; content: string } | null => {
  const unordered = line.match(/^\s{0,3}[-*+]\s+(.+)$/);
  if (unordered) return { ordered: false, content: unordered[1] };

  const ordered = line.match(/^\s{0,3}\d+[.)]\s+(.+)$/);
  if (ordered) return { ordered: true, content: ordered[1] };

  return null;
};

const parseBlockquoteLine = (line: string): string | null => {
  const match = line.match(/^\s{0,3}>\s?(.*)$/);
  return match ? match[1] : null;
};

const splitTableRow = (line: string): string[] => {
  let value = line.trim();
  if (value.startsWith("|")) value = value.slice(1);
  if (value.endsWith("|")) value = value.slice(0, -1);

  const cells: string[] = [];
  let cell = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "|" && value[index - 1] !== "\\") {
      cells.push(cell.trim().replace(/\\\|/g, "|"));
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim().replace(/\\\|/g, "|"));
  return cells;
};

const isTableSeparator = (line: string): boolean => {
  const cells = splitTableRow(line);
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
};

const isTableStart = (lines: string[], index: number): boolean => {
  if (index + 1 >= lines.length || !lines[index].includes("|")) return false;
  const headers = splitTableRow(lines[index]);
  const separators = splitTableRow(lines[index + 1]);
  return headers.length > 1 && headers.length === separators.length && isTableSeparator(lines[index + 1]);
};

const isBlockStart = (lines: string[], index: number): boolean => {
  const line = lines[index];
  return Boolean(
    parseFenceStart(line) ||
      parseHeading(line) ||
      parseListItem(line) ||
      parseBlockquoteLine(line) !== null ||
      isTableStart(lines, index)
  );
};

const normalizeTableCells = (cells: string[], length: number): string[] => {
  const nextCells = cells.slice(0, length);
  while (nextCells.length < length) nextCells.push("");
  return nextCells;
};

const parseBlockLines = (lines: string[]): MarkdownNode[] => {
  const blocks: MarkdownNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    const fence = parseFenceStart(line);
    if (fence) {
      index += 1;
      const codeLines: string[] = [];
      while (index < lines.length && !isFenceEnd(lines[index], fence.marker, fence.size)) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: "code", language: fence.language, code: codeLines.join("\n") });
      continue;
    }

    const heading = parseHeading(line);
    if (heading) {
      blocks.push({ type: "heading", ...heading });
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const headers = splitTableRow(lines[index]);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].trim().length > 0 && lines[index].includes("|")) {
        rows.push(normalizeTableCells(splitTableRow(lines[index]), headers.length));
        index += 1;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    const quoteLine = parseBlockquoteLine(line);
    if (quoteLine !== null) {
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const nextQuoteLine = parseBlockquoteLine(lines[index]);
        if (nextQuoteLine === null) break;
        quoteLines.push(nextQuoteLine);
        index += 1;
      }
      blocks.push({ type: "blockquote", children: parseBlockLines(quoteLines) });
      continue;
    }

    const firstListItem = parseListItem(line);
    if (firstListItem) {
      const items: string[] = [];
      const ordered = firstListItem.ordered;
      while (index < lines.length) {
        const nextItem = parseListItem(lines[index]);
        if (nextItem && nextItem.ordered === ordered) {
          items.push(nextItem.content);
          index += 1;
          continue;
        }
        if (/^\s{2,}\S/.test(lines[index]) && items.length > 0) {
          items[items.length - 1] = `${items[items.length - 1]}\n${lines[index].trim()}`;
          index += 1;
          continue;
        }
        break;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length && lines[index].trim().length > 0 && !isBlockStart(lines, index)) {
      paragraphLines.push(lines[index].trimEnd());
      index += 1;
    }
    if (paragraphLines.length > 0) {
      blocks.push({ type: "paragraph", lines: paragraphLines });
    } else {
      index += 1;
    }
  }

  return blocks;
};

export const parseMarkdownBlocks = (source: string): MarkdownNode[] => parseBlockLines(normalizeMarkdown(source).split("\n"));

const renderInline = (text: string, keyPrefix: string): ReactNode[] => {
  const nodes: ReactNode[] = [];
  let buffer = "";
  let index = 0;

  const flushBuffer = (): void => {
    if (buffer.length > 0) {
      nodes.push(buffer);
      buffer = "";
    }
  };

  while (index < text.length) {
    if (text[index] === "`") {
      const end = text.indexOf("`", index + 1);
      if (end > index + 1) {
        flushBuffer();
        nodes.push(<code key={`${keyPrefix}-code-${nodes.length}`}>{text.slice(index + 1, end)}</code>);
        index = end + 1;
        continue;
      }
    }

    if (text[index] === "[") {
      const labelEnd = text.indexOf("]", index + 1);
      if (labelEnd > index + 1 && text[labelEnd + 1] === "(") {
        const hrefEnd = text.indexOf(")", labelEnd + 2);
        if (hrefEnd > labelEnd + 2) {
          flushBuffer();
          const label = text.slice(index + 1, labelEnd);
          const safeHref = sanitizeMarkdownLink(text.slice(labelEnd + 2, hrefEnd));
          nodes.push(
            safeHref ? (
              <a key={`${keyPrefix}-link-${nodes.length}`} href={safeHref} target="_blank" rel="noreferrer">
                {renderInline(label, `${keyPrefix}-link-${nodes.length}`)}
              </a>
            ) : (
              <span key={`${keyPrefix}-link-${nodes.length}`} className="markdown-link-unsafe">
                {renderInline(label, `${keyPrefix}-link-${nodes.length}`)}
              </span>
            )
          );
          index = hrefEnd + 1;
          continue;
        }
      }
    }

    const strongMarker = text.startsWith("**", index) ? "**" : text.startsWith("__", index) ? "__" : null;
    if (strongMarker) {
      const end = text.indexOf(strongMarker, index + 2);
      if (end > index + 2) {
        flushBuffer();
        nodes.push(
          <strong key={`${keyPrefix}-strong-${nodes.length}`}>
            {renderInline(text.slice(index + 2, end), `${keyPrefix}-strong-${nodes.length}`)}
          </strong>
        );
        index = end + 2;
        continue;
      }
    }

    const emphasisMarker = text[index] === "*" || text[index] === "_" ? text[index] : null;
    if (emphasisMarker) {
      const end = text.indexOf(emphasisMarker, index + 1);
      if (end > index + 1) {
        flushBuffer();
        nodes.push(
          <em key={`${keyPrefix}-em-${nodes.length}`}>{renderInline(text.slice(index + 1, end), `${keyPrefix}-em-${nodes.length}`)}</em>
        );
        index = end + 1;
        continue;
      }
    }

    buffer += text[index];
    index += 1;
  }

  flushBuffer();
  return nodes;
};

const renderInlineLines = (lines: string[], keyPrefix: string): ReactNode[] =>
  lines.flatMap((line, index) => [
    ...(index > 0 ? [<br key={`${keyPrefix}-br-${index}`} />] : []),
    ...renderInline(line, `${keyPrefix}-line-${index}`)
  ]);

const renderMarkdownNode = (
  block: MarkdownNode,
  keyPrefix: string,
  onCopy: (kind: CopyKind, text: string) => void
): ReactElement => {
  switch (block.type) {
    case "heading": {
      const content = renderInline(block.text, `${keyPrefix}-heading`);
      switch (block.depth) {
        case 1:
          return <h1 key={keyPrefix}>{content}</h1>;
        case 2:
          return <h2 key={keyPrefix}>{content}</h2>;
        case 3:
          return <h3 key={keyPrefix}>{content}</h3>;
        case 4:
          return <h4 key={keyPrefix}>{content}</h4>;
        case 5:
          return <h5 key={keyPrefix}>{content}</h5>;
        default:
          return <h6 key={keyPrefix}>{content}</h6>;
      }
    }
    case "list": {
      const List = block.ordered ? "ol" : "ul";
      return (
        <List key={keyPrefix}>
          {block.items.map((item, index) => (
            <li key={`${keyPrefix}-item-${index}`}>{renderInlineLines(item.split("\n"), `${keyPrefix}-item-${index}`)}</li>
          ))}
        </List>
      );
    }
    case "blockquote":
      return <blockquote key={keyPrefix}>{block.children.map((child, index) => renderMarkdownNode(child, `${keyPrefix}-${index}`, onCopy))}</blockquote>;
    case "code":
      return (
        <div className="markdown-code-block" key={keyPrefix}>
          <div className="markdown-code-header">
            <span>{block.language ?? "code"}</span>
            <button
              className="icon-button markdown-copy-button"
              type="button"
              onClick={() => onCopy("code", block.code)}
              title="Copy code"
              aria-label="Copy code block"
            >
              <Copy size={13} />
            </button>
          </div>
          <pre>
            <code className={block.language ? `language-${block.language}` : undefined}>{block.code}</code>
          </pre>
        </div>
      );
    case "table":
      return (
        <div className="markdown-table-wrap" key={keyPrefix}>
          <table>
            <thead>
              <tr>
                {block.headers.map((header, index) => (
                  <th key={`${keyPrefix}-header-${index}`}>{renderInline(header, `${keyPrefix}-header-${index}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={`${keyPrefix}-row-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${keyPrefix}-row-${rowIndex}-cell-${cellIndex}`}>
                      {renderInline(cell, `${keyPrefix}-row-${rowIndex}-cell-${cellIndex}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "paragraph":
    default:
      return <p key={keyPrefix}>{renderInlineLines(block.lines, `${keyPrefix}-paragraph`)}</p>;
  }
};

export function MarkdownBlock({
  source,
  title,
  className,
  compact = false,
  showCopy = true,
  clipboard,
  onCopied,
  onCopyError
}: MarkdownBlockProps): ReactElement {
  const blocks = parseMarkdownBlocks(source);

  const handleCopy = (kind: CopyKind, text: string): void => {
    try {
      const copyOperation = kind === "code" ? copyCodeBlockSource(text, clipboard) : copyMarkdownSource(text, clipboard);
      void copyOperation.then(
        () => onCopied?.(kind),
        (error: unknown) => onCopyError?.(error)
      );
    } catch (error) {
      onCopyError?.(error);
    }
  };

  return (
    <section className={clsx("markdown-block", compact && "compact", className)}>
      {(title || showCopy) && (
        <header className="markdown-block-header">
          {title ? <h3>{title}</h3> : <span aria-hidden="true" />}
          {showCopy && (
            <button
              className="icon-button markdown-copy-button"
              type="button"
              onClick={() => handleCopy("markdown", source)}
              title="Copy Markdown source"
              aria-label="Copy Markdown source"
            >
              <Copy size={14} />
            </button>
          )}
        </header>
      )}
      <div className="markdown-content">
        {blocks.length > 0 ? blocks.map((block, index) => renderMarkdownNode(block, `markdown-${index}`, handleCopy)) : <p>No content.</p>}
      </div>
    </section>
  );
}
