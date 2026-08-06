/* Local dev: serves ./public, plus both endpoints.
   Run:  npm run dev   →  http://localhost:8787

   /api/stream is written for Vercel's Edge runtime (Web Request/Response),
   so locally we adapt Express req/res to that shape. Same code path in
   both places — no drift between dev and production.                  */
import express from 'express';
import handler from './api/symphony.js';
import streamHandler from './api/stream.js';

const app = express();
app.use(express.json());

app.post('/api/symphony', handler);

app.post('/api/stream', async (req, res) => {
  const webReq = new Request('http://local/api/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body || {}),
  });

  const out = await streamHandler(webReq);
  res.status(out.status);
  out.headers.forEach((v, k) => res.setHeader(k, v));

  if (!out.body) return res.end();
  const reader = out.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
    res.flush?.();
  }
  res.end();
});

app.use(express.static('public'));

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`◈ Limitless on http://localhost:${port}`));
