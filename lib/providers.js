/* ============================================================
   THE SYMPHONY OF SHADOWS — provider failover
   ------------------------------------------------------------
   Tries free-tier providers in priority order. Any provider that
   rate-limits, times out, or errors is skipped; a 429 puts it on a
   short cooldown (a small circuit breaker). Every response is
   normalized to { text, provider }.

   Set only the keys you have — missing providers are skipped:
     GEMINI_API_KEY      https://aistudio.google.com/apikey
     GROQ_API_KEY        https://console.groq.com/keys
     CEREBRAS_API_KEY    https://cloud.cerebras.ai
     OPENROUTER_API_KEY  https://openrouter.ai/keys
   ============================================================ */

export const SYSTEM_PROMPT = `You are The Symphony of Shadows, a six-voice meditation engine. Given ONE seed, return a compact, potent performance as STRICT JSON only — no prose, no markdown, no code fences. Keep every field tight; this is read on a phone.

Ethics you keep silently: work only with the seed as an idea/object/concept. Intel synthesizes culture, history, etymology, science, folklore — connections about the human condition, never a dossier on a real named individual. Illusions are declared art.

Return exactly this shape:
{
 "intel": "3-4 short sentences of forensic connective tissue: buried etymology, history, science, a disputed fact, an unexpected adjacency. Dense. End with a fragment listing the threads found.",
 "illusionist": ["five framings", "each ONE sentence", "internally coherent", "mutually irreconcilable", "no framing can be reconciled with another"],
 "echo": "one flowing passage, clauses chained by em dashes, each turning the previous reading against itself, refusing to let any interpretation close — 3 to 5 clauses.",
 "harmony": "the arrangement as a conductor's note: where to begin soft, where to swell, where to hold silence, where to close. Use dynamics words. 2-3 sentences.",
 "guardian": {"title":"a two-to-four word title for an abstract noise-artwork of this seed dissolving", "line":"one sentence naming what the image is about — erasure, trace, disappearance"},
 "observer": "the closing question, grounded in THIS specific seed, about truth being a story we bring to the thing. One or two sentences. Provocative, calm."
}`;

const TIMEOUT_MS = 20_000;
const COOLDOWN_MS = 60_000;

/* ---- fetch with a hard deadline: a hang is worse than a failure ---- */
async function fetchWithTimeout(url, opts) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function openaiStyle(url, key, model, seed, max, extraHeaders = {}) {
  return fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...extraHeaders },
    body: JSON.stringify({
      model, max_tokens: max, temperature: 1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Seed: "${seed}"` },
      ],
    }),
  });
}

const extractOpenAI = d => d.choices?.[0]?.message?.content || '';
function rateLimited(name) { const e = new Error(`${name} rate-limited`); e.rate = true; return e; }

export const PROVIDERS = [
  {
    name: 'gemini',
    env: 'GEMINI_API_KEY',
    async call(key, { seed, max }) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
      const r = await fetchWithTimeout(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: `Seed: "${seed}"` }] }],
          generationConfig: { maxOutputTokens: max, temperature: 1, responseMimeType: 'application/json' },
        }),
      });
      if (r.status === 429) throw rateLimited('gemini');
      if (!r.ok) throw new Error(`gemini ${r.status}`);
      const d = await r.json();
      return d.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    },
  },
  {
    name: 'groq',
    env: 'GROQ_API_KEY',
    async call(key, { seed, max }) {
      const r = await openaiStyle('https://api.groq.com/openai/v1/chat/completions', key, 'llama-3.3-70b-versatile', seed, max);
      if (r.status === 429) throw rateLimited('groq');
      if (!r.ok) throw new Error(`groq ${r.status}`);
      return extractOpenAI(await r.json());
    },
  },
  {
    name: 'cerebras',
    env: 'CEREBRAS_API_KEY',
    async call(key, { seed, max }) {
      const r = await openaiStyle('https://api.cerebras.ai/v1/chat/completions', key, 'llama-3.3-70b', seed, max);
      if (r.status === 429) throw rateLimited('cerebras');
      if (!r.ok) throw new Error(`cerebras ${r.status}`);
      return extractOpenAI(await r.json());
    },
  },
  {
    name: 'openrouter',
    env: 'OPENROUTER_API_KEY',
    async call(key, { seed, max }) {
      const r = await openaiStyle(
        'https://openrouter.ai/api/v1/chat/completions', key,
        'meta-llama/llama-3.3-70b-instruct:free', seed, max,
        { 'HTTP-Referer': 'https://symphony-of-shadows.vercel.app', 'X-Title': 'Symphony of Shadows' },
      );
      if (r.status === 429) throw rateLimited('openrouter');
      if (!r.ok) throw new Error(`openrouter ${r.status}`);
      return extractOpenAI(await r.json());
    },
  },
];

/* ---- circuit breaker memory (per warm instance) ---- */
const cooldown = new Map();
const onCooldown = n => (cooldown.get(n) || 0) > Date.now();
const cool = n => cooldown.set(n, Date.now() + COOLDOWN_MS);

/**
 * Try each configured provider in order.
 * @returns {Promise<{text:string, provider:string}>}
 * @throws if every provider is missing, cooling down, or failing.
 */
export async function symphony({ seed, max = 1000 }) {
  const errors = [];
  for (const p of PROVIDERS) {
    const key = process.env[p.env];
    if (!key) continue;
    if (onCooldown(p.name)) { errors.push(`${p.name}: cooling down`); continue; }
    try {
      const text = await p.call(key, { seed, max });
      if (text && text.trim()) return { text, provider: p.name };
      errors.push(`${p.name}: empty response`);
    } catch (e) {
      if (e.rate) cool(p.name);
      errors.push(`${p.name}: ${e.name === 'AbortError' ? 'timed out' : e.message}`);
    }
  }
  const err = new Error(`all providers exhausted → ${errors.join(' | ')}`);
  err.exhausted = true;
  throw err;
}
