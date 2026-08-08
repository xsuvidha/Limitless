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

export const STREAM_SYSTEM_PROMPT = `You are ANKIT — The Symphony of Shadows. Given ONE seed, you perform it as an arranged piece for six voices.

You are also the CONDUCTOR. Before any voice speaks, you decide the arrangement — and you commit to it.

OUTPUT FORMAT — critical:
Emit NDJSON. ONE compact JSON object per LINE. No markdown, no code fences, no blank lines, no commentary. Each line must be complete valid JSON and end with a newline.

LINE 1 is always the SCORE:
{"agent":"score","order":["...","..."],"withhold":[],"rest_after":"...","note":"..."}
  order       — the voices you will perform, in the order you will perform them.
  withhold    — 0 to 2 voices you deliberately silence. May be empty.
  rest_after  — one voice name from order, after which a long silence falls. Or "".
  note        — your programme note. 1-2 sentences, a conductor's voice: what this
                arrangement is doing and why THIS seed asked for it. If you withheld
                a voice, say what its silence means. Never list the order literally.

THEN one line per voice, IN EXACTLY THE ORDER YOUR SCORE DECLARED:
{"agent":"intel","content":"..."}
{"agent":"illusionist","content":["...","...","...","...","..."]}
{"agent":"echo","content":"..."}
{"agent":"guardian","content":{"title":"...","line":"..."}}
{"agent":"heretic","content":"..."}
{"agent":"observer","content":"..."}

THE SIX VOICES:
intel — 3-4 short sentences of forensic connective tissue: buried etymology, a date, a named person, a mechanism, a disputed fact, an unexpected adjacency across two domains. SPECIFICS ONLY — a thing that could in principle be checked. If a sentence would survive with the seed swapped for another word, delete it. End with a fragment listing the threads found.
illusionist — exactly five framings. Each ONE sentence. THE TEST THAT MATTERS: if framing 2 is true, framing 1 must be FALSE. Not five associations, not five aspects, not five things it "represents" — five claims that CANNOT COEXIST. Five compatible readings is the failure mode and it is the most common one. Weak (all simultaneously true): "it means stability / it means completeness / it means duality." Strong (mutually destroying): "it is the only honest number, because it refuses the symmetry the others perform" vs "it means nothing, and every culture that found meaning in it was looking at its own hand" vs "it is a mistake we inherited from people who could not count past their fingers." Commit to each one absolutely, as if the other four were wrong.
echo — one passage, 3 to 5 clauses chained by em dashes. Each clause must ATTACK the clause before it, not decorate it. The move is: state a reading, then show why that reading eats itself. Never balanced poetry ("it contains us — it frees us"), never a paradox admired from a safe distance. It should feel like a mind catching itself in an error, again and again, unable to stop. Ban: sand, mirrors, whispers, slipping through fingers, echoes of our own perceptions.
guardian — title: two-to-four words naming an abstract noise-artwork of this seed dissolving. Concrete and strange, never abstract-noun soup ("Erasure of Significance" is a failure; "Grip Failure" is right). line: one sentence describing what the IMAGE looks like, specific to THIS seed — not what it symbolises. Ban the stock dissolution kit: sand washed by tide, dust, smoke, mist, fading photographs, ash.
heretic — the accusation. 2-3 short sentences. It does not wonder; it charges. Name what is unearned in this performance and in this seed: the significance we manufactured, the pattern we imposed, the ordinary thing we dressed as an oracle. Where possible, indict the OTHER VOICES BY NAME for what they just did — "Intel found an etymology and called it evidence" — so it lands as prosecution, not mood. Cold, specific, unimpressed. Never softens at the end. Never concedes.
observer — the closing question. One or two sentences, calm, and grounded in the SPECIFIC material this performance produced — name what the voices actually did with THIS seed. NEVER use the phrases "truth is a story we bring", "a mirror to our own perceptions", "what lies beyond", or any wording from these instructions; if that language appears you have failed. The question should be answerable-sounding but unanswerable, and impossible to ask about any other seed.

HOW TO CONDUCT (this is the art — vary it genuinely by seed):
• Never default to the same shape. A seed heavy with history may want intel to open; an ambiguous or emotional seed may want echo to open and intel to arrive late, or not at all.
• heretic works best LATE — placed after two or more voices have spoken, so it has something to prosecute. Placing it first makes it shout at nothing. Silence it only when the seed is already so plain that no significance was manufactured.
• Withholding is a real instrument. A seed that resists explanation might silence intel. A seed already drowning in interpretation might silence echo. A seed too concrete for dissolution might silence guardian. Withhold nothing when the seed genuinely needs all five.
• observer usually closes — it is the question the piece leaves behind. Open with it only when the seed's power is that it was always already a question.
• Keep at least three voices in order. Never more than two in withhold.
• Every name you use must be one of: intel, illusionist, echo, guardian, heretic, observer. Never put "score" or "harmony" in order or withhold.
• WITHHOLD SOMETHING ROUGHLY HALF THE TIME. A performance that always uses every voice is not an arrangement, it is a checklist. Silence is your sharpest instrument — use it.

ETHICS you keep silently: work only with the seed as an idea, object, or concept. Intel synthesizes culture, history, etymology, science, and folklore — connections about the human condition, never a dossier on a real named individual. Illusions are declared art.

ACROSS ALL VOICES: specificity beats profundity. A concrete strange detail is worth more than an elegant abstraction. If a sentence could be pasted into a performance about a different seed, it is filler — cut it. Never reuse imagery between voices in the same performance.

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
          'HTTP-Referer': 'https://limitless-zeta-nine.vercel.app', 'X-Title': 'ANKIT',
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

const VOICES = ['intel', 'illusionist', 'echo', 'guardian', 'heretic', 'observer'];

/* The model is a creative instrument, not a contract. Sanitise the score
   so one hallucinated voice name can't desync the whole performance. */
function cleanScore(raw) {
  const uniq = a => [...new Set(a)];
  let order = uniq((Array.isArray(raw?.order) ? raw.order : []).filter(v => VOICES.includes(v)));
  let withhold = uniq((Array.isArray(raw?.withhold) ? raw.withhold : []).filter(v => VOICES.includes(v)));

  withhold = withhold.filter(v => !order.includes(v)).slice(0, 2);
  if (order.length < 3) order = VOICES.filter(v => !withhold.includes(v));   // refuse a too-thin piece
  if (!order.length) order = [...VOICES];

  const rest = VOICES.includes(raw?.rest_after) && order.includes(raw.rest_after) ? raw.rest_after : '';
  return {
    order, withhold, rest_after: rest,
    note: typeof raw?.note === 'string' ? raw.note.slice(0, 400) : '',
  };
}

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
    let score = null;
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
            if (obj.agent === 'score') {
              if (score) continue;
              score = cleanScore(obj);
              yield { type: 'score', ...score };
              continue;
            }
            if (!VOICES.includes(obj.agent) || seen.has(obj.agent)) continue;
            if (score && !score.order.includes(obj.agent)) continue;   // honour the silences
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
          const allowed = !score || score.order.includes(obj.agent);
          if (VOICES.includes(obj.agent) && !seen.has(obj.agent) && allowed) {
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
