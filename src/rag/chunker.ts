export function chunk(text: string, chunkSize = 1000, overlap = 100): string[] {
  text = text.trim()
  if (!text) return []
  if (text.length <= chunkSize) return [text]

  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    const rawEnd = start + chunkSize

    if (rawEnd >= text.length) {
      const c = text.slice(start).trim()
      if (c) chunks.push(c)
      break
    }

    const breakAt = findBreak(text, rawEnd, start)
    const c = text.slice(start, breakAt).trim()
    if (c) chunks.push(c)

    const next = breakAt - overlap
    start = next > start ? next : breakAt  // always advance
  }

  return chunks
}

function findBreak(text: string, pos: number, min: number): number {
  const lookback = Math.min(200, pos - min)

  for (let i = pos; i > pos - lookback; i--) {
    const ch = text[i]
    if (ch === '\n') return i + 1
    if (ch === ' ' && i > 0 && '.!?'.includes(text[i - 1])) return i + 1
  }

  for (let i = pos; i > pos - lookback; i--) {
    if (text[i] === ' ') return i + 1
  }

  return pos
}
