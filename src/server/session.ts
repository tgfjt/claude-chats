import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type { SessionEntry } from "../types.js";

type Block = { type?: string; text?: string; name?: string; input?: unknown; content?: unknown };

function blocksToText(blocks: readonly Block[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.type === "text" && typeof b.text === "string") out.push(b.text);
    else if (b.type === "tool_result") {
      if (typeof b.content === "string") out.push(b.content);
      else if (Array.isArray(b.content)) out.push(blocksToText(b.content as Block[]));
    }
  }
  return out.join("\n\n");
}

export function normalizeEntry(raw: unknown): SessionEntry[] {
  if (!raw || typeof raw !== "object") return [];
  const e = raw as Record<string, unknown>;
  const type = e.type;
  const ts = typeof e.timestamp === "string" ? e.timestamp : "";
  const data = (e.data ?? e) as Record<string, unknown>;

  if (type === "user" || type === "assistant") {
    const message = data.message as Record<string, unknown> | undefined;
    const content = message?.content;
    if (typeof content === "string") {
      return [{ kind: type, ts, text: content }];
    }
    if (Array.isArray(content)) {
      const blocks = content as Block[];
      const results: SessionEntry[] = [];
      const textParts: string[] = [];
      for (const b of blocks) {
        if (b.type === "text" && typeof b.text === "string") {
          textParts.push(b.text);
        } else if (b.type === "tool_use" && typeof b.name === "string") {
          results.push({ kind: "tool_use", ts, name: b.name, input: b.input });
        } else if (b.type === "tool_result") {
          const text =
            typeof b.content === "string"
              ? b.content
              : Array.isArray(b.content)
                ? blocksToText(b.content as Block[])
                : "";
          results.push({ kind: "tool_result", ts, text });
        }
      }
      if (textParts.length > 0) {
        results.unshift({ kind: type, ts, text: textParts.join("\n\n") });
      }
      return results;
    }
    return [];
  }

  if (type === "system") {
    const text = typeof data.text === "string" ? data.text : JSON.stringify(data);
    return [{ kind: "system", ts, text }];
  }

  return [];
}

export async function readSession(filePath: string): Promise<SessionEntry[]> {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  const out: SessionEntry[] = [];
  try {
    for await (const line of rl) {
      if (!line) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      out.push(...normalizeEntry(parsed));
    }
  } finally {
    rl.close();
    stream.destroy();
  }
  return out;
}
