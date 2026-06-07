import type { Part } from "@opencode-ai/sdk/v2"

export type SearchMatch = {
  messageID: string
  ratio: number
  charIndex: number
}

export function findMatches(
  partsByMessage: Record<string, Part[]>,
  query: string,
): SearchMatch[] {
  if (!query) return []

  const lowerQuery = query.toLowerCase()
  const results: SearchMatch[] = []

  for (const messageID of Object.keys(partsByMessage)) {
    const parts = partsByMessage[messageID]
    let text = ""
    const matchPositions: number[] = []

    for (const part of parts) {
      if (part.type === "text" && !part.synthetic && !part.ignored) {
        text += part.text
      }
    }

    if (!text) continue

    const lowerText = text.toLowerCase()
    let pos = 0

    while (true) {
      pos = lowerText.indexOf(lowerQuery, pos)
      if (pos === -1) break
      matchPositions.push(pos)
      pos += lowerQuery.length
    }

    for (const charIndex of matchPositions) {
      const ratio = text.length > 0 ? charIndex / text.length : 0
      results.push({ messageID, ratio, charIndex })
    }
  }

  return results
}
