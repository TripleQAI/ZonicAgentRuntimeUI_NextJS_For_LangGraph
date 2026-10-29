/** One server-sent event frame (the WHATWG event-stream format). */
export interface SseFrame {
  id?: string;
  event: string;
  data: string;
}

/**
 * Incremental event-stream parser (the Adapter of design Section 14.2): bytes in, frames out.
 * Handles chunks split anywhere (inside a line or a UTF-8 sequence), CR, LF and CRLF line ends,
 * multi-line `data`, comments and frames without an `event` field.
 */
export class SseParser {
  private readonly decoder = new TextDecoder();
  private buffer = '';
  private id: string | undefined;
  private event = '';
  private data: string[] = [];

  /** Feeds a chunk; returns the frames it completed. */
  push(chunk: Uint8Array | string): SseFrame[] {
    this.buffer += typeof chunk === 'string' ? chunk : this.decoder.decode(chunk, { stream: true });
    const frames: SseFrame[] = [];
    for (;;) {
      const end = this.buffer.search(/\r\n|\r|\n/);
      if (end < 0) break;
      // A lone CR at the end may be the first half of CRLF: wait for the next chunk.
      if (this.buffer[end] === '\r' && end === this.buffer.length - 1) break;
      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + (this.buffer.startsWith('\r\n', end) ? 2 : 1));
      const frame = this.line(line);
      if (frame) frames.push(frame);
    }
    return frames;
  }

  /** Ends the stream: a final frame without its blank line is dropped, as the format says. */
  end(): void {
    this.buffer = '';
    this.event = '';
    this.data = [];
  }

  private line(line: string): SseFrame | undefined {
    if (line === '') {
      if (this.data.length === 0) {
        this.event = '';
        return undefined;
      }
      const frame: SseFrame = {
        ...(this.id !== undefined ? { id: this.id } : {}),
        event: this.event || 'message',
        data: this.data.join('\n'),
      };
      this.event = '';
      this.data = [];
      return frame;
    }
    if (line.startsWith(':')) return undefined;
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') this.data.push(value);
    else if (field === 'event') this.event = value;
    else if (field === 'id' && !value.includes('\0')) this.id = value;
    return undefined;
  }
}

/** Reads a response body as frames until it ends or the signal aborts. */
export async function* readSse(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<SseFrame> {
  const parser = new SseParser();
  const reader = body.getReader();
  const abort = () => void reader.cancel().catch(() => undefined);
  signal?.addEventListener('abort', abort, { once: true });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      yield* parser.push(value);
    }
    parser.end();
  } finally {
    signal?.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}
