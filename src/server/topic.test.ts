import { describe, expect, it } from "vitest";
import { extractTopicFromEntry } from "./topic.js";

describe("extractTopicFromEntry", () => {
  it("returns topic when content is a string", () => {
    const entry = {
      type: "user",
      isSidechain: false,
      data: { message: { content: "hello world" } },
    };
    expect(extractTopicFromEntry(entry)?.topic).toBe("hello world");
  });

  it("returns topic when content[0] is a text block", () => {
    const entry = {
      type: "user",
      isSidechain: false,
      data: { message: { content: [{ type: "text", text: "なあ相談にのってくれ" }] } },
    };
    expect(extractTopicFromEntry(entry)?.topic).toBe("なあ相談にのってくれ");
  });

  it("rejects when content[0] is tool_result", () => {
    const entry = {
      type: "user",
      isSidechain: false,
      data: {
        message: { content: [{ type: "tool_result", content: "file contents", tool_use_id: "x" }] },
      },
    };
    expect(extractTopicFromEntry(entry)).toBeNull();
  });

  it("rejects slash-command wrapper-only messages", () => {
    const entry = {
      type: "user",
      isSidechain: false,
      data: {
        message: {
          content: [
            {
              type: "text",
              text: "<command-name>/foo</command-name><command-message>foo</command-message>",
            },
          ],
        },
      },
    };
    expect(extractTopicFromEntry(entry)).toBeNull();
  });

  it("strips <command-*> wrapper and keeps the real prompt", () => {
    const entry = {
      type: "user",
      isSidechain: false,
      data: {
        message: {
          content: [
            {
              type: "text",
              text: "<command-name>/foo</command-name><command-args>bar</command-args>Tell me about Y",
            },
          ],
        },
      },
    };
    expect(extractTopicFromEntry(entry)?.topic).toBe("Tell me about Y");
  });

  it("rejects sidechain entries", () => {
    const entry = {
      type: "user",
      isSidechain: true,
      data: { message: { content: "ignored" } },
    };
    expect(extractTopicFromEntry(entry)).toBeNull();
  });

  it("rejects entries with toolUseResult", () => {
    const entry = {
      type: "user",
      isSidechain: false,
      toolUseResult: { stdout: "ok" },
      data: { message: { content: "ignored" } },
    };
    expect(extractTopicFromEntry(entry)).toBeNull();
  });

  it("rejects assistant-typed entries", () => {
    expect(
      extractTopicFromEntry({
        type: "assistant",
        isSidechain: false,
        data: { message: { content: "hi" } },
      }),
    ).toBeNull();
  });

  it("truncates long prompts with an ellipsis", () => {
    const long = "a".repeat(200);
    const entry = { type: "user", isSidechain: false, data: { message: { content: long } } };
    const picked = extractTopicFromEntry(entry);
    expect(picked?.topic.length).toBe(80);
    expect(picked?.topic.endsWith("…")).toBe(true);
  });
});
