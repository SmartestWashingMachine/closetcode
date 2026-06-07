import { describe, expect, test } from "bun:test"
import type { PromptInfo } from "../../../../src/cli/cmd/tui/component/prompt/history"
import { assign, expandTrackedPastedText, strip } from "../../../../src/cli/cmd/tui/component/prompt/part"

describe("prompt part", () => {
  test("strip removes persisted ids from reused file parts", () => {
    const part = {
      id: "prt_old",
      sessionID: "ses_old",
      messageID: "msg_old",
      type: "file" as const,
      mime: "image/png",
      filename: "tiny.png",
      url: "data:image/png;base64,abc",
    }

    expect(strip(part)).toEqual({
      type: "file",
      mime: "image/png",
      filename: "tiny.png",
      url: "data:image/png;base64,abc",
    })
  })

  test("assign overwrites stale runtime ids", () => {
    const part = {
      id: "prt_old",
      sessionID: "ses_old",
      messageID: "msg_old",
      type: "file" as const,
      mime: "image/png",
      filename: "tiny.png",
      url: "data:image/png;base64,abc",
    } as PromptInfo["parts"][number]

    const next = assign(part)

    expect(next.id).not.toBe("prt_old")
    expect(next.id.startsWith("prt_")).toBe(true)
    expect(next).toMatchObject({
      type: "file",
      mime: "image/png",
      filename: "tiny.png",
      url: "data:image/png;base64,abc",
    })
  })

  test("expandTrackedPastedText preserves wide characters around pasted text", () => {
    const marker = "[Pasted ~3 lines]"
    const prefix = "你好你好\n"

    expect(
      expandTrackedPastedText(prefix + marker + "\n阿斯顿法国红酒看来", [
        {
          start: Bun.stringWidth("你好你好") + 1,
          end: Bun.stringWidth("你好你好") + 1 + Bun.stringWidth(marker),
          text: "public:\n\tvoid ExecuteTask();\nprivate:",
        },
      ]),
    ).toBe("你好你好\npublic:\n\tvoid ExecuteTask();\nprivate:\n阿斯顿法国红酒看来")
  })

  test("expandTrackedPastedText only expands the tracked placeholder occurrence", () => {
    const marker = "[Pasted ~3 lines]"
    const prefix = `keep ${marker} then `

    expect(
      expandTrackedPastedText(prefix + marker + " tail", [
        {
          start: Bun.stringWidth(prefix),
          end: Bun.stringWidth(prefix + marker),
          text: "alpha\nbeta\ngamma",
        },
      ]),
    ).toBe(`keep ${marker} then alpha\nbeta\ngamma tail`)
  })

  test("expandTrackedPastedText replaces placeholder with longer text preserving surrounding content", () => {
    const result = expandTrackedPastedText("hello [Pasted ~3 lines] world", [
      {
        start: Bun.stringWidth("hello "),
        end: Bun.stringWidth("hello [Pasted ~3 lines]"),
        text: "line1\nline2\nline3",
      },
    ])
    expect(result).toBe("hello line1\nline2\nline3 world")
  })

  test("expandTrackedPastedText handles long replacement in multiline context", () => {
    // promptOffsetWidth counts newlines as 1, matching the extmark positions
    const promptOffsetWidth = (s: string) => {
      let w = 0
      for (const c of s) w += c === "\n" ? 1 : Bun.stringWidth(c)
      return w
    }
    const input = "above\n[Pasted ~5 lines]\nbelow"
    const result = expandTrackedPastedText(input, [
      {
        start: promptOffsetWidth("above\n"),
        end: promptOffsetWidth("above\n[Pasted ~5 lines]"),
        text: "a\nb\nc\nd\ne",
      },
    ])
    expect(result).toBe("above\na\nb\nc\nd\ne\nbelow")
  })
})
