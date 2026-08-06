import { streamSymphony } from '../lib/stream.js';

/* Edge runtime: streams reliably on Vercel and starts in ~0ms.
   Node serverless buffers responses in some configs, which would
   defeat the entire point of streaming.                          */
export const config = { runtime: 'edge' };

const enc = new TextEncoder();
const sse = obj => enc.encode(`data: ${JSON.stringify(obj)}\n\n`);

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: cors });
  }

  let seed = '';
  try {
    const body = await req.json();
    seed = String(body?.seed || '').trim().slice(0, 200);
  } catch { /* fall through to the empty check */ }

  if (!seed) {
    return new Response(JSON.stringify({ error: 'a seed is required' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of streamSymphony(seed)) {
          controller.enqueue(sse(ev));
        }
      } catch (e) {
        controller.enqueue(sse({ type: 'error', message: e?.message || 'the instruments fell silent' }));
      } finally {
        controller.enqueue(enc.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...cors,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',   // stops proxies from buffering the stream
    },
  });
}
