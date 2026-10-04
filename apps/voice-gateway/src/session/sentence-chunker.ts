export const MAX_CHUNK_CHARS = 120;

const STRONG = new Set(["?", "!", "।"]);
const TRAIL = new Set([".", "?", "!", "।", '"', "'", ")", "”", "’"]);
const isSpace = (c: string | undefined) => c !== undefined && /\s/.test(c);

/**
 * Finds the end (exclusive) of the first complete sentence in `buf`, or -1.
 * `?`, `!` and the Devanagari danda split immediately; `.` only when followed by whitespace so
 * "Dr. Rao", "2.30" and "Rs.500" stay intact. Trailing closers/terminators stay with the sentence.
 */
function sentenceEnd(buf: string): number {
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i]!;
    if (c !== "." && !STRONG.has(c)) continue;
    let j = i;
    while (j + 1 < buf.length && TRAIL.has(buf[j + 1]!)) j++;
    if (c === "." && !STRONG.has(buf[j]!) && buf[j] !== "।") {
      if (j + 1 >= buf.length) return -1; // can't tell yet ("2." vs "2.30")
      if (!isSpace(buf[j + 1])) {
        i = j;
        continue;
      }
    }
    return j + 1;
  }
  return -1;
}

function capEnd(buf: string): number {
  const window = buf.slice(0, MAX_CHUNK_CHARS);
  const ws = window.search(/\s\S*$/);
  return ws > 0 ? ws : MAX_CHUNK_CHARS;
}

/**
 * Re-chunks a stream of LLM text deltas into speakable sentences: split at . ? ! or the
 * Devanagari danda, or at 120 characters (preferring the last space). Whitespace-only pieces
 * are dropped; the remainder is flushed when the input ends.
 */
export async function* chunkSentences(stream: AsyncIterable<string>): AsyncIterable<string> {
  let buf = "";
  for await (const delta of stream) {
    buf += delta;
    for (;;) {
      const end = sentenceEnd(buf);
      let cut = -1;
      if (end !== -1 && end <= MAX_CHUNK_CHARS) cut = end;
      else if (buf.length >= MAX_CHUNK_CHARS) cut = capEnd(buf);
      if (cut === -1) break;
      const piece = buf.slice(0, cut).trim();
      buf = buf.slice(cut);
      if (piece) yield piece;
    }
  }
  for (;;) {
    const tail = buf.trim();
    if (!tail) return;
    if (tail.length <= MAX_CHUNK_CHARS) {
      yield tail;
      return;
    }
    const cut = capEnd(buf);
    const piece = buf.slice(0, cut).trim();
    buf = buf.slice(cut);
    if (piece) yield piece;
  }
}
