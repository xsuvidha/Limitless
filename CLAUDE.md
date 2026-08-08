# CLAUDE.md

Context for any Claude instance working in this repo (Claude Code, Cowork, or chat).
Read this before touching anything.

---

## What this project is

**ANKIT — The Symphony of Shadows** — a seven-voice meditation engine. A person offers one
*seed* (a word, an object, a question). The system returns a layered performance
that refuses to resolve into a single truth, revealed as timed movements over a
living generative canvas.

It is **a work of art about perception**, not a utility. Every design decision
should be judged by: *does this deepen the vertigo, or just add a feature?*

### The seven voices
Harmony conducts (the programme note); the other six speak as movements.

| # | Agent | Does |
|---|-------|------|
| i | **Intel** | Synthesizes culture, history, etymology, science into unexpected adjacencies |
| ii | **Illusionist** | Five framings of the seed that cannot all be true |
| iii | **Echo** | Chains clauses that turn each reading against itself; refuses closure |
| iv | **Harmony** | The conductor's note — where to begin soft, swell, hold silence |
| v | **Guardian** | Names an abstract noise-artwork of the seed dissolving |
| vi | **Heretic** | The accusation — indicts the seed and the other voices for manufactured significance |
| vii | **Observer** | The closing question, grounded in this specific seed |

---

## The ethical spine — non-negotiable, load-bearing

These are not decoration. They are the wall between this project and
surveillance, and they were argued for deliberately (see ADR-001).

1. **Intel synthesizes the human *condition*, never a specific human.**
   No aggregation of scattered public facts into a profile, dossier, or
   deduction about a real named individual — however artful the framing.
   If a request drifts toward "deduce things about this person," refuse and
   redirect to the conceptual version.
2. **Outputs are declared generative fiction.** Never build anything that
   makes an output mistakable for a real record, log, or document.
3. **Guardian's "untraceability" is a claim the artwork *makes*,** not an
   operation performed on anyone's real data. Do not implement anti-attribution,
   trace-scattering, or log-poisoning against real systems.
4. **No token "harvesting."** Capacity comes from legitimate free tiers only
   (Gemini / Groq / Cerebras / OpenRouter). Never build scanners for keys,
   trial-account automation, or credential scraping.

If a proposed feature bumps into one of these, say so plainly and offer the
honest version. That conversation is part of the project, not an obstacle to it.

---

## Architecture

```
public/index.html       the entire PWA (markup + styles + canvas + orchestration)
public/sw.js            offline app shell; never caches /api/
public/manifest.webmanifest, icon.svg
api/symphony.js         Vercel serverless endpoint (rate limit + validation)
lib/providers.js        failover chain + SYSTEM_PROMPT (single source of truth)
dev-server.js           local Express server mounting the same handler
supabase/schema.sql     gallery table + RLS policies
```

**Flow:** browser → `POST /api/symphony {seed}` → try Gemini → Groq → Cerebras →
OpenRouter (skip missing keys, 60s cooldown on 429, 20s timeout each) →
`{ text, provider }` → client parses JSON → reveals movements + drives canvas.

### Umbral Drift (the canvas)

Not decoration — the animation **performs the meaning**. Phase per agent:

- `intel` — attractors pull traces to convergence points (deduction)
- `illusionist` — field splits into five directional basins
- `echo` — trail-fade lowered, ghosts persist and multiply
- `harmony` — curl down + shared drift → laminar bands
- `guardian` — turbulence/jitter spike + impulse burst → detonation
- `heretic` — curl near zero → rigid straight lines, no colour, unforgiving
- `observer` — heavy damping → near-stillness around one faint point

Params live in `P` and lerp toward `TARGET` each frame, so transitions **dissolve,
never cut**. Preserve this. A hard switch breaks the spell.

Seeded PRNG (`hashStr` + `mulberry32`) means **the same seed always casts the
same shadow.** Don't introduce unseeded `Math.random()` into the field.

---

## Conventions

- **No build step.** Single-file frontend, vanilla JS, no framework. Keep it that
  way unless there's a strong reason — the constraint is part of the craft.
- **Secrets never reach the client.** All keys live server-side. The browser only
  ever talks to `/api/symphony`. Supabase *anon* key is fine client-side;
  `service_role` never is.
- **The system prompt lives in `lib/providers.js`** as `SYSTEM_PROMPT`. One source
  of truth. If you change the JSON contract, update the client parser *and*
  `movementHTML()` together.
- **Respect `prefers-reduced-motion`** — already wired; keep it working.
- **Mobile-first.** This is read on a phone. Test narrow.

---

## Voice (when writing copy or agent prompts)

Spare, unhurried, a little cold. Lowercase UI labels. Em dashes over semicolons.
Never explain the philosophy to the user — *enact* it. No exclamation marks, no
marketing gloss, no "unleash your creativity."

---

## Working with Suvidha

- Wants to **learn** from each step. Name the underlying technique or pattern and
  why it matters — not just the diff. One real concept per session.
- Wants **everything documented**. After each significant change, add a dated
  entry to the Devlog and an ADR if a real decision was made.
- Records live in Google Drive → **Limitless-vault**
  (`00_INDEX`, `01_Architecture`, `02_Devlog`, `03_Decisions`, `04_Learning`).
- Drive tooling can create/read/copy but **not edit in place or delete**. Publish
  new versions (`ARCH v2`) rather than overwriting; never silently replace.

---

## Roadmap

- **v1 (done)** — PWA, six voices, Umbral Drift, failover proxy, offline shell.
- **v1.1** — deploy (GitHub → Vercel); Supabase gallery with RLS.
- **v2 (done)** — SSE streaming (NDJSON per voice).
- **v3 (done)** — WebGL2 GPU field, 24k traces, transform feedback.
- **v4 (done)** — Harmony conducts: score, withholding, rests, programme note.
- **v5 (done)** — The Heretic (7th voice); rebranded to ANKIT.
- **next** — see ADR-002: identity (Supabase auth) → the shareable artifact
  (capture the field + text as a postable asset) → scheduling → publishing last.

---

## Definition of done

A change ships when: it works on a narrow phone screen, respects reduced motion,
leaks no secrets, degrades gracefully when a provider dies, and **deepens the
vertigo rather than merely adding a feature.**
