import { describe, expect, it } from 'vitest';
import { readSse, SseParser } from '@/lib/stream/sse';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('event-stream parser', () => {
  it('parses frames with id, event and data, and skips comments', () => {
    const parser = new SseParser();
    expect(parser.push(': comment\nid: 3\nevent: token.delta\ndata: {"a":1}\n\n')).toEqual([
      { id: '3', event: 'token.delta', data: '{"a":1}' },
    ]);
  });

  it('joins multi-line data and accepts CRLF and CR line ends', () => {
    const parser = new SseParser();
    expect(parser.push('data: one\r\ndata: two\r\n\r\ndata: three\r\r: next')).toEqual([
      { event: 'message', data: 'one\ntwo' },
      { event: 'message', data: 'three' },
    ]);
  });

  it('completes a frame split across chunks, including inside a UTF-8 character and a CRLF', () => {
    const parser = new SseParser();
    const encoded = bytes('id: 1\nevent: token.delta\ndata: {"text":"héllo 👋"}\r\n\r\n');
    const cut = encoded.indexOf(0xf0) + 2;
    const frames = [
      ...parser.push(encoded.slice(0, 10)),
      ...parser.push(encoded.slice(10, cut)),
      ...parser.push(encoded.slice(cut, encoded.length - 3)),
      ...parser.push(encoded.slice(encoded.length - 3)),
    ];
    expect(frames).toEqual([{ id: '1', event: 'token.delta', data: '{"text":"héllo 👋"}' }]);
  });

  it('keeps the last id for frames without one and drops an unterminated final frame', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes('id: 7\ndata: a\n\ndata: b\n\ndata: unterminated'));
        controller.close();
      },
    });
    const frames = [];
    for await (const frame of readSse(body)) frames.push(frame);
    expect(frames).toEqual([
      { id: '7', event: 'message', data: 'a' },
      { id: '7', event: 'message', data: 'b' },
    ]);
  });
});
