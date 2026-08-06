/* ============================================================
   LIMITLESS — streaming provider chain
   ------------------------------------------------------------
   Same failover idea as providers.js, but each provider streams.

   The trick that makes streaming clean: we ask the model for
   NDJSON — ONE json object per LINE, one line per agent. That way
   the server never has to parse half-finished JSON. It buffers
   raw text, splits on newlines, and forwards each COMPLETE line
   the moment it lands. First voice arrives in ~1s instead of ~8s.
   ============================================================ */

export const STREAM_SYSTEM_PROMPT = `You are Limitless — The Symphony of Shadows, a six-voice meditation engine. Given ONE seed, perform it as six voices.

OUTPUT FORMAT — this is critical:
Emit NDJSON: exactly six lines, ONE compact JSON object per line, in the order below. No markdown, no code fences, no blank lines, no commentary. Each line must be complete valid JSON on its own and end with a newline.

Line 1: {"agent":"intel","content":"..."}
Line 2: {"agent":"illusionist","content":["...","...","...","...","..."]}
Line 3: {"agent":"echo","content":"..."}
Line 4: {"agent":"harmony","content":"..."}
Line 5: {"agent":"guardian","content":{"title":"...","line":"..."}}
Line 6: {"agent":"observer","content":"..."}

WHAT EACH VOICE DOES:
intel — 3-4 short sentences of forensic connective tissue: buried etymology, history, science, a disputed fact, an unexpected adjacency. Dense. End with a fragment listing the threads found.
illusionist — exactly five framings of the seed. Each ONE sentence, internally coherent, and mutually irreconcilable: no two can both be true.
echo — one flowing passage, 3 to 5 clauses chained by em dashes, each turning the previous reading against itself, refusing to let any interpretation close.
harmony — the arrangement as a conductor's note: where to begin soft, where to swell, where to hold silence, where to close. Use dynamics words. 2-3 sentences.
guardian — title: two-to-four words naming an abstract noise-artwork of this seed dissolving. line: one sentence on what the image is about — erasure, trace, disappearance.
observer — the closing question, grounded in THIS specific seed, about truth being a story we bring to the thing. One or two sentences. Provocative, calm.

ETHICS you keep silently: work only with the seed as an idea, object, or concept. Intel synthesizes culture, history, etymology, science, and folklore — connections about the human condition, never a dossier on a real named individual. Illusions are declared art.

Keep every field tight. This is read on a phone.`;

const TIMEOUT_MS = 25_000;
const COOLDOWN_MS = 60_000;

const cooldown = new Map();
const onCooldown = n => (cooldown.get(n) || 0) > Date.now();
const cool = n => cooldown.set(n, Date.now() + COOLDOWN_MS);

function rateLimited(name) { const e = new Error(`${name} rate-limited`); e.rate = true; return e; }

/* ---- one SSE line parser, reused by every provider ----
   Providers all speak SSE ("data: {...}"), they just nest the
   text at different paths. extract() pulls the delta out.      */
async function* sseText(response, extract) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';                    // keep the partial line
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const piece = extract(JSON.parse(payload));
        if (piece) yield piece;
      } catch { /* skip malformed keep-alive frames */ }
    }
  }
}

function withDeadline() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

const openaiBody = (model, seed) => JSON.stringify({
  model, max_tokens: 1200, temperature: 1, stream: true,
  messages: [
    { role: 'system', content: STREAM_SYSTEM_PROMPT },
    { role: 'user', content: `Seed: "${seed}"` },
  ],
});

const openaiExtract = d => d.choices?.[0]?.delta?.content || '';

export const STREAM_PROVIDERS = [
  {
    name: 'gemini',
    env: 'GEMINI_API_KEY',
    async *stream(key, seed) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${key}`;
      const d = withDeadline();
      const r = await fetch(url, {
        method: 'POST', signal: d.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: STREAM_SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: `Seed: "${seed}"` }] }],
          generationConfig: { maxOutputTokens: 1200, temperature: 1 },
        }),
      });
      d.done();
      if (r.status === 429) throw rateLimited('gemini');
      if (!r.ok) throw new Error(`gemini ${r.status}`);
      yield* sseText(r, j => j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '');
    },
  },
  {
    name: 'groq',
    env: 'GROQ_API_KEY',
    async *stream(key, seed) {
      const d = withDeadline();
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', signal: d.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: openaiBody('llama-3.3-70b-versatile', seed),
      });
      d.done();
      if (r.status === 429) throw rateLimited('groq');
      if (!r.ok) throw new Error(`groq ${r.status}`);
      yield* sseText(r, openaiExtract);
    },
  },
  {
    name: 'cerebras',
    env: 'CEREBRAS_API_KEY',
    async *stream(key, seed) {
      const d = withDeadline();
      const r = await fetch('https://api.cerebras.ai/v1/chat/completions', {
        method: 'POST', signal: d.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: openaiBody('llama-3.3-70b', seed),
      });
      d.done();
      if (r.status === 429) throw rateLimited('cerebras');
      if (!r.ok) throw new Error(`cerebras ${r.status}`);
      yield* sseText(r, openaiExtract);
    },
  },
  {
    name: 'openrouter',
    env: 'OPENROUTER_API_KEY',
    async *stream(key, seed) {
      const d = withDeadline();
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', signal: d.signal,
        headers: {
          'Content-Type': 'application/json', Authorization: `Bearer ${key}`,
          'HTTP-Referer': 'https://limitless-zeta-nine.vercel.app', 'X-Title': 'Limitless',
        },
        body: openaiBody('meta-llama/llama-3.3-70b-instruct:free', seed),
      });
      d.done();
      if (r.status === 429) throw rateLimited('openrouter');
      if (!r.ok) throw new Error(`openrouter ${r.status}`);
      yield* sseText(r, openaiExtract);
    },
  },
];

const VOICES = ['intel', 'illusionist', 'echo', 'harmony', 'guardian', 'observer'];

/**
 * Try each provider in order. Yields events:
 *   { type:'provider', name }
 *   { type:'agent', agent, content }
 *   { type:'done', count }
 *   { type:'error', message }
 *
 * A provider that dies BEFORE emitting its first voice is retried past.
 * One that dies mid-performance is not — we'd rather show a partial
 * symphony than restart and duplicate voices the reader already saw.
 */
export async function* streamSymphony(seed) {
  const errors = [];

  for (const p of STREAM_PROVIDERS) {
    const key = process.env[p.env];
    if (!key) continue;
    if (onCooldown(p.name)) { errors.push(`${p.name}: cooling down`); continue; }

    let buf = '';
    let emitted = 0;
    let announced = false;
    const seen = new Set();

    try {
      for await (const chunk of p.stream(key, seed)) {
        if (!announced && chunk) { announced = true; yield { type: 'provider', name: p.name }; }
        buf += chunk;

        // forward every COMPLETE line; keep the partial tail buffered
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const t = line.trim().replace(/^```(?:json)?|```$/g, '').trim();
          if (!t.startsWith('{')) continue;
          try {
            const obj = JSON.parse(t);
            if (!VOICES.includes(obj.agent) || seen.has(obj.agent)) continue;
            seen.add(obj.agent);
            emitted++;
            yield { type: 'agent', agent: obj.agent, content: obj.content };
          } catch { /* line not complete/valid JSON — drop it */ }
        }
      }

      // the final line often arrives without a trailing newline
      const tail = buf.trim().replace(/^```(?:json)?|```$/g, '').trim();
      if (tail.startsWith('{')) {
        try {
          const obj = JSON.parse(tail);
          if (VOICES.includes(obj.agent) && !seen.has(obj.agent)) {
            emitted++;
            yield { type: 'agent', agent: obj.agent, content: obj.content };
          }
        } catch { /* incomplete tail */ }
      }

      if (emitted > 0) { yield { type: 'done', count: emitted }; return; }
      errors.push(`${p.name}: no voices`);
    } catch (e) {
      if (e.rate) cool(p.name);
      const msg = e.name === 'AbortError' ? 'timed out' : e.message;
      errors.push(`${p.name}: ${msg}`);
      // mid-performance failure: keep what the reader already has
      if (emitted > 0) { yield { type: 'done', count: emitted, partial: true }; return; }
    }
  }

  yield { type: 'error', message: `all providers exhausted → ${errors.join(' | ')}` };
}
