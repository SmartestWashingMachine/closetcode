import { describe, expect, test } from "bun:test"
import { findMatches, type SearchMatch } from "@/cli/cmd/tui/util/search"
import type { Part } from "@opencode-ai/sdk/v2"

function textPart(overrides: Partial<{ id: string; sessionID: string; messageID: string; text: string; synthetic: boolean; ignored: boolean }> = {}): Part {
  return {
    id: overrides.id ?? "prt_test",
    sessionID: overrides.sessionID ?? "ses_test",
    messageID: overrides.messageID ?? "msg_test",
    type: "text",
    text: overrides.text ?? "",
    synthetic: overrides.synthetic,
    ignored: overrides.ignored,
  }
}

function toolPart(messageID: string): Part {
  return {
    id: "prt_tool",
    sessionID: "ses_test",
    messageID,
    type: "tool",
    callID: "call_1",
    tool: "bash",
    state: { status: "completed", input: {}, output: "some output", title: "bash", metadata: {}, time: { start: 0, end: 0 } },
  }
}

function reasoningPart(messageID: string, text: string): Part {
  return {
    id: "prt_reasoning",
    sessionID: "ses_test",
    messageID,
    type: "reasoning",
    text,
    time: { start: 0 },
  }
}

function partsByMessage(record: Record<string, Part[]>): Record<string, Part[]> {
  return record
}

describe("findMatches", () => {
  test("returns empty array for empty messages", () => {
    const result = findMatches({}, "test")
    expect(result).toEqual([])
  })

  test("returns empty array for empty query", () => {
    const parts = partsByMessage({
      msg_1: [textPart({ messageID: "msg_1", text: "hello world" })],
    })
    expect(findMatches(parts, "")).toEqual([])
    expect(findMatches(parts, "  ")).toEqual([])
  })

  test("finds query in a single user message", () => {
    const parts = partsByMessage({
      msg_1: [textPart({ messageID: "msg_1", text: "the quick brown fox" })],
    })
    const result = findMatches(parts, "quick")
    expect(result).toHaveLength(1)
    expect(result[0].messageID).toBe("msg_1")
    expect(result[0].ratio).toBeGreaterThan(0)
    expect(result[0].ratio).toBeLessThan(1)
    expect(result[0].charIndex).toBe(4)
  })

  test("finds query in assistant text part", () => {
    const parts = partsByMessage({
      msg_2: [textPart({ messageID: "msg_2", text: "Here is my implementation:\n\nfunction add(a, b) {\n  return a + b\n}" })],
    })
    const result = findMatches(parts, "function")
    expect(result).toHaveLength(1)
    expect(result[0].messageID).toBe("msg_2")
  })

  test("finds multiple occurrences in one message", () => {
    const parts = partsByMessage({
      msg_1: [textPart({ messageID: "msg_1", text: "foo bar foo baz foo qux" })],
    })
    const result = findMatches(parts, "foo")
    expect(result).toHaveLength(3)
    expect(result.every((m) => m.messageID === "msg_1")).toBe(true)
    // Each match should have a different ratio (different position in text)
    const ratios = new Set(result.map((m) => m.ratio))
    expect(ratios.size).toBe(3)
    // Each match should have a unique charIndex
    expect(result[0].charIndex).toBe(0)
    expect(result[1].charIndex).toBe(8)
    expect(result[2].charIndex).toBe(16)
  })

  test("finds matches across multiple messages", () => {
    const parts = partsByMessage({
      msg_1: [textPart({ messageID: "msg_1", text: "hello world" })],
      msg_2: [textPart({ messageID: "msg_2", text: "hello again" })],
    })
    const result = findMatches(parts, "hello")
    expect(result).toHaveLength(2)
    expect(result[0].messageID).toBe("msg_1")
    expect(result[1].messageID).toBe("msg_2")
  })

  test("skips synthetic text parts", () => {
    const parts = partsByMessage({
      msg_1: [
        textPart({ messageID: "msg_1", text: "real content", synthetic: false }),
        textPart({ messageID: "msg_1", text: "synthetic match", synthetic: true }),
      ],
    })
    const result = findMatches(parts, "synthetic")
    expect(result).toHaveLength(0)
  })

  test("skips ignored text parts", () => {
    const parts = partsByMessage({
      msg_1: [
        textPart({ messageID: "msg_1", text: "real content" }),
        textPart({ messageID: "msg_1", text: "ignored match", ignored: true }),
      ],
    })
    const result = findMatches(parts, "ignored")
    expect(result).toHaveLength(0)
  })

  test("does not search tool or reasoning parts", () => {
    const parts = partsByMessage({
      msg_1: [
        textPart({ messageID: "msg_1", text: "actual text" }),
        toolPart("msg_1"),
        reasoningPart("msg_1", "thinking text"),
      ],
    })
    // Only "actual text" is searchable — "thinking text" and tool output are not
    expect(findMatches(parts, "thinking")).toHaveLength(0)
    expect(findMatches(parts, "actual")).toHaveLength(1)
  })

  test("is case insensitive", () => {
    const parts = partsByMessage({
      msg_1: [textPart({ messageID: "msg_1", text: "Hello World" })],
    })
    expect(findMatches(parts, "hello")).toHaveLength(1)
    expect(findMatches(parts, "HELLO")).toHaveLength(1)
    expect(findMatches(parts, "HeLLo")).toHaveLength(1)
  })

  test("returns 0 matches for non-existent query", () => {
    const parts = partsByMessage({
      msg_1: [textPart({ messageID: "msg_1", text: "hello world" })],
    })
    expect(findMatches(parts, "xyzzy")).toHaveLength(0)
  })

  test("sets correct ratio for match at start of text", () => {
    const parts = partsByMessage({
      msg_1: [textPart({ messageID: "msg_1", text: "match at start" })],
    })
    const result = findMatches(parts, "match")
    expect(result[0].ratio).toBe(0)
    expect(result[0].charIndex).toBe(0)
  })

  test("sets correct ratio for match at end of text", () => {
    const parts = partsByMessage({
      msg_1: [textPart({ messageID: "msg_1", text: "text with match" })],
    })
    const result = findMatches(parts, "match")
    expect(result[0].ratio).toBeCloseTo(10 / 15, 5) // "text with " is 10 chars, "text with match" is 15
    expect(result[0].charIndex).toBe(10)
  })

  test("includes both text parts in a single message concatenation", () => {
    const parts = partsByMessage({
      msg_1: [
        textPart({ messageID: "msg_1", text: "first part " }),
        textPart({ messageID: "msg_1", text: "second part" }),
      ],
    })
    const result = findMatches(parts, "part")
    expect(result).toHaveLength(2)
  })

  test("query that appears only in synthetic parts returns no matches", () => {
    const parts = partsByMessage({
      msg_1: [
        textPart({ messageID: "msg_1", text: "real content", synthetic: true }),
        textPart({ messageID: "msg_1", text: "only synthetic", synthetic: true, ignored: true }),
      ],
    })
    expect(findMatches(parts, "only")).toHaveLength(0)
    expect(findMatches(parts, "real")).toHaveLength(0)
  })
})
