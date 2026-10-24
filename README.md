# Disco

**Stress less, party more.** A mobile-first friend recommendation and private group-planning app, with a four-phone presentation view.

## Run it

Requires **Node.js 22.13+** (Node 24 recommended). There are no third-party runtime packages to install.

```sh
npm start
```

On this Windows machine, where Node is not on PATH:

```powershell
.\start.ps1
```

- Mobile app: <http://127.0.0.1:3000>
- Four-user demo: <http://127.0.0.1:3000/demo>
- Usernames: `ricky`, `aditya`, `arnav`, `daniel`
- Initial demo password for all four: `disco2026`

In the demo toolbar, enter the password once and choose **Log in all four**. Each phone authenticates separately. The toolbar receives neither private context nor session tokens. Click a phone’s header to highlight it. The story buttons change presentation captions; they do not fabricate activity.

Data persists in `data/disco.sqlite` between restarts. The database and `.env` are ignored by Git. Share source and `data/seed.json`; each teammate gets an independent database on first run. To start a separate rehearsal without changing your main database, set `DB_PATH=data/rehearsal.sqlite` before launching.

## Connect real models and web lookup

Copy `.env.example` to `.env` and set the provider and keys locally. Never commit keys.

### Google AI Studio / Gemini

```dotenv
AGENT_PROVIDER=gemini
GEMINI_API_KEY=your-key
GEMINI_MODEL=gemini-2.5-flash
ENABLE_WEB_SEARCH=true
```

The model name is configurable; use one available to your account. Gemini interprets chat and evaluates each person’s proposal using only their own context. Google Search grounding retrieves public restaurant facts when requested and when plans are made. No private context is included in the search query. Results are cached for 15 minutes per venue/date/time, with source links and unknown values kept explicit.

### NVIDIA

```dotenv
AGENT_PROVIDER=nvidia
NVIDIA_API_KEY=your-key
NVIDIA_MODEL=meta/llama-3.3-70b-instruct
```

NVIDIA supplies the personal-agent model through its chat-completions API. Web search is a separate capability: the current search adapter uses Gemini grounding and therefore also needs a Gemini key plus `ENABLE_WEB_SEARCH=true`. NVIDIA inference alone does not supply a browser.

Restart after editing `.env`. Model and search quotas/pricing depend on your account; no claim of unlimited or universally free service is made. No external provider requests were tested without your keys.

Official integration references: [Gemini generateContent](https://ai.google.dev/api/generate-content), [Google Search grounding](https://ai.google.dev/gemini-api/docs/generate-content/google-search), [NVIDIA LLM API](https://docs.api.nvidia.com/nim/reference/llm-apis).

### Local mode

With no provider key, the app runs **clearly labeled local demo agents**. These use deterministic constraint checks and a limited chat parser. This supports testing the complete app without API costs, but is not an LLM. Real model failures fall back to local checks and are labeled in the plan. Web details remain unverified when search is unavailable.

## What works

- Four password-protected prepared accounts with hashed passwords and expiring server-side sessions.
- Separate private budgets, dietary requirements, interests, recurring availability, energy, and preferences.
- Chat-based temporary constraints and explicit consent before long-term memory; view/forget memory through chat.
- Recommendations grounded in friends’ stored quotes; only the current person’s graph is queried.
- Ratings and reviews from chat or a form; rankings recompute live for connected friends.
- Restaurant catalog, item details, source links, saved “Want to try” items, activity feed, likes, friends and friend requests.
- Additional music, movie/TV, book, and product items can be entered and reviewed. The supplied dataset is primarily venues.
- Host-chosen groups, candidate restaurants, bounded three-round negotiation, live status, host approval, invitations, RSVP, renegotiation, change summaries, and reconfirmations.
- Declines, no-solution cases, stale approval, changed constraints, expired invites, and interrupted negotiation are handled explicitly.
- Simulated booking confirmation and downloadable `.ics` event after everyone accepts. No actual restaurant booking, payment, or calendar sync occurs.
- Four independent mobile sessions displayed together, with live updates through authenticated server-sent events.

## Privacy boundary

`Engine.state()` and `planView()` enumerate public fields. Another user’s context, personal chat, memories, password hash, and plan overrides never serialize into your response. A person’s model gets only their own private context. The shared negotiation log accepts fixed message types and phrases, not model-generated prose. The host sees an alternative time or “a cheaper option is needed,” never another person’s exact spending limit or private reason.

The application server stores the contexts and is trusted infrastructure; this is logical per-agent access separation, not end-to-end encryption or isolated model processes. The local demo is bound to loopback by default. Production rollout would need HTTPS, deployment configuration, account management, stronger operational controls, and a proper database migration strategy.

## Data provenance

`scripts/import_seed.py` reads the supplied workbook without changing it. `data/seed.json` contains its 20 sheets, including four main people, 32 fictional secondary people, 308 synthetic opinions, 112 network edges, and 4,251 OSM places plus 90 starter venue rows. Duplicate venue listings from different sources retain their original identifiers.

Synthetic reviews are labeled throughout the UI. The original sentiment-only rows receive explicitly described derived taste scores. Venue artwork is original illustrative SVG, not photography of the named venue. Hours and prices are not fabricated. A plan’s **proposed meal allowance is not a restaurant price**.

OpenStreetMap data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), under ODbL; source links are retained with each listing.

## Tests

```sh
npm test
npm run check
```

Tests cover authentication, the full plan lifecycle, authorization, privacy projection, approval gating, reconfirmation, hard dietary checks, memory consent, ranking updates, expired invitations, static-file isolation, and origin checks. HTTP tests open an ephemeral loopback server.

## Structure

| File | Responsibility |
| --- | --- |
| `server.mjs` | HTTP routes, authentication, SSE, static files, calendar export |
| `lib/data.mjs` | Workbook normalization, SQLite persistence, sessions |
| `lib/engine.mjs` | Recommendations, private agent evaluation, plans, memory, chat |
| `lib/providers.mjs` | Gemini/NVIDIA model adapters and grounded web lookup |
| `public/app.js` | Mobile screens and interactions |
| `public/styles.css` | Disco’s cream/lavender design system |
| `public/demo.*` | Four-phone demonstration layout |
| `tests/flow.test.mjs` | Core behavioral and privacy checks |

See `docs/DEMO.md` for the short presentation path and `docs/TEAM.md` for work ownership and API contracts.
