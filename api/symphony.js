import { symphony } from '../lib/providers.js';

/* Naive per-instance rate limit. Serverless instances are ephemeral, so
   this is a speed bump, not a wall — swap for Supabase/Upstash counters
   when you want a real limit across all instances. */
const hits = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;

function limited(ip) {
  const now = Date.now();
  const rec = hits.get(ip) || { n: 0, reset: now + WINDOW_MS };
  if (now > rec.reset) { rec.n = 0; rec.reset = now + WINDOW_MS; }
  rec.n += 1;
  hits.set(ip, rec);
  return rec.n > MAX_PER_WINDOW;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (limited(ip)) return res.status(429).json({ error: 'too many performances — wait a moment' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const seed = String(body.seed || '').trim().slice(0, 200);   // clamp input
    if (!seed) return res.status(400).json({ error: 'a seed is required' });

    const out = await symphony({ seed, max: 1000 });
    return res.status(200).json(out);
  } catch (e) {
    const code = e.exhausted ? 503 : 500;
    return res.status(code).json({ error: e.message || 'the instruments fell silent' });
  }
}
