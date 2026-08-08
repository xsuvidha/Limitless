# ANKIT
### The Symphony of Shadows

> Offer a single seed. Watch its truth refuse to settle.

A six-voice meditation engine on perception, complexity, and truth — delivered as
an installable PWA with a generative field that *performs* the philosophy instead
of decorating it.

Give it one word. Seven voices answer: **Intel** finds buried adjacencies,
**Illusionist** splits it into five framings that can't all be true, **Echo**
refuses to let any close, **Harmony** arranges the vertigo, **Guardian** names its
dissolution, and **Observer** asks what's left of truth when it's over.

---

## Quick start

```bash
npm install
cp .env.example .env      # add at least one provider key
npm run dev               # → http://localhost:8787
```

You need **one** API key to run. Get a free one in about 60 seconds:

| Provider | Free tier | Get a key |
|---|---|---|
| Gemini (AI Studio) | generous — start here | https://aistudio.google.com/apikey |
| Groq | fast, free tier | https://console.groq.com/keys |
| Cerebras | free tier | https://cloud.cerebras.ai |
| OpenRouter | `:free` models | https://openrouter.ai/keys |

Add as many as you like — the proxy tries them in order and skips any that are
missing, timing out, or rate-limited.

---

## Deploy to Vercel

```bash
npm i -g vercel
vercel login
vercel                                        # first deploy (preview)
vercel env add GEMINI_API_KEY production      # repeat per key
vercel --prod
```

`vercel.json` serves `public/` as static and `api/symphony.js` as a serverless
function at `/api/symphony`. No build step.

Once it's on a real URL, the service worker registers and the app becomes
installable — "Add to Home Screen" gives you a standalone app.

---

## Structure

```
public/index.html          the whole PWA (markup, styles, canvas, orchestration)
public/sw.js               offline app shell — never caches /api/
api/symphony.js            serverless endpoint: validation + rate limit
lib/providers.js           failover chain + the system prompt
dev-server.js              local Express server, same handler
supabase/schema.sql        gallery table + Row Level Security policies
CLAUDE.md                  context for AI assistants working in this repo
```

## How the failover works

Each provider gets a **20-second deadline** (a hang is worse than a failure). A
`429` puts that provider on a **60-second cooldown** — a small circuit breaker, so
we stop hammering something that's already saying no. Missing keys are skipped
silently. Every response is normalized to `{ text, provider }`.

If all providers fail, the endpoint returns `503` and the app says the instruments
fell silent — rather than spinning forever.

## The canvas

The field beneath the text is driven by whichever agent is speaking: traces
converge under Intel, split into five streams under Illusionist, ghost and
multiply under Echo, fall into calm bands under Harmony, detonate under Guardian,
and settle to near-stillness under Observer. Parameters interpolate every frame,
so transitions dissolve rather than cut.

A seeded PRNG means the same seed always casts the same shadow.

---

## Ethics

Intel synthesizes culture, history, and ideas — **never a dossier on a real
person**. Outputs are declared generative fiction. Guardian's "untraceability" is
a claim the artwork makes, not an operation performed on anyone's data. Capacity
comes from legitimate free tiers only. See `CLAUDE.md` for the full spine.
