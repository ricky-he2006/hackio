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
GEMINI_MODEL=gemini-3.8-flash
ENABLE_WEB_SEARCH=true
```

The model name is configurable; use one available to your account. Gemini interprets chat and evaluates each person’s proposal using only their own context. Google Search grounding retrieves public restaurant facts when requested and when plans are made. No private context is included in the search query. Results are cached for 15 minutes per venue/date/time, with source links and unknown values kept explicit.

### NVIDIA

```dotenv
AGENT_PROVIDER=nvidia
NVIDIA_API_KEY=your-key
NVIDIA_MODEL=nvidia/nemotron-3.5-lightning-30b-a3b
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
- Host-chosen groups, candidate restaurants, an optional second activity, bounded three-round negotiation, live status, host approval, invitations, RSVP, renegotiation, change summaries, and reconfirmations.
- Declines, no-solution cases, stale approval, changed constraints, expired invites, and interrupted negotiation are handled explicitly.
- Simulated booking confirmation and downloadable `.ics` event after everyone accepts. No actual restaurant booking, payment, or calendar sync occurs.
- All 18 screens from `App Mockups.html`: chat recommendations, chat-started plans with a live “rounding up your party” card, working it out, approval sheet, invite, plan changed (including “keep the original time without them”), feed with comments and want-to-try activity, place pages with friend tag counts, log it, profile lists by category, adventures with status stickers, adventure details, friends (accept/decline), add friends with an invite link and QR code, welcome, quick rate (answers become rough ratings), want-to-try match cards with a shared free-time conclusion, and rate the night.
- Onboarding imports (music, maps, streaming) are demo toggles only; nothing is imported. Contacts are not read.
- Four independent mobile sessions displayed together, with live updates through authenticated server-sent events.
- Opt-in proactive shared-venue suggestions: connected friends can independently save the same venue, receive privacy-safe interest prompts, consent independently, and hand the resulting opportunity to the existing bounded negotiation and approval flow.

### Proactive planning

Proactive planning is off by default. In **Settings**, a user must enable suggestions and explicitly allow saved-place interest to be shared. The initial prompt never names the other people or reveals their saved places. Quiet hours and the default one-suggestion-per-day limit are enforced by the server.

The core endpoints are authenticated:

- `POST /api/proactive/settings` — update opt-in and sharing controls.
- `POST /api/proactive/respond` — accept, defer, or decline one interest check.
- `POST /api/proactive/start` — start the existing planning negotiation after every eligible participant consents; only the first consenting organizer may start it.

Opportunity records, participant consent, typed coordination messages, and notification metadata are persisted inside the encrypted state store. Other triggers (similar interests, events, and group bucket lists) remain intentionally deferred.

## Privacy boundary

See [docs/SECURITY.md](docs/SECURITY.md) for protections and known limits.

`Engine.state()` and `planView()` enumerate public fields. Another user’s context, personal chat, memories, password hash, and plan overrides never serialize into your response. The shared negotiation log accepts fixed message types and phrases, not model-generated prose. The host sees an alternative time or “a cheaper option is needed,” never another person’s exact spending limit or private reason.

- **Model inputs are allow-listed.** A person’s model gets only the fields it reasons over from their own context (budget, hours, days, diet, preferences, interests, energy). Saved-memory history, raw web text, rendered search HTML, and URLs are not sent.
- **Nothing publishes from chat without consent.** When you mention a place you liked, your agent suggests a review; you write the note and post it. Your chat message is never used as the quote.
- **Strict diets need evidence.** A strict diet (e.g. “halal”, not “halal preferred”) passes when a well-rated review the person can see is tagged with it, or when a web source claims it. A web-only pass gets a private “check with the restaurant” note from that person’s own agent; the group is never told anyone’s diet.
- **Untrusted text is kept out of instructions.** User-added items’ names never reach web search or the chat model, and listed venues enter the search prompt as a labelled data block.
- **Shared free time is coarse.** “It’s a match” cards say “Both free Saturday evening”, never the exact overlap, which would reveal a friend’s private hours.
- **Inference protections:** other agents’ individual verdicts stay private, proposed allowances round down in $5 steps, and negotiations are capped per friend per day. Group outcomes still reveal some information; see the security document for limits.

The application server stores the contexts and is trusted infrastructure; this is logical per-agent access separation, not end-to-end encryption or isolated model processes. The local demo is bound to loopback by default. Production rollout would need HTTPS, deployment configuration, account management, stronger operational controls, and a proper database migration strategy.

## Data provenance

`scripts/import_seed.py` reads the supplied workbook without changing it. `data/seed.json` contains its 20 sheets, including four main people, 32 fictional secondary people, 308 synthetic opinions, 112 network edges, and 4,251 OSM places plus 90 starter venue rows. Duplicate venue listings from different sources retain their original identifiers.

Synthetic reviews are labeled throughout the UI. The original sentiment-only rows receive explicitly described derived taste scores. With `GOOGLE_PLACES_KEY`, chat, place, and match cards show the venue’s Google Places photo (credited to its photographer); without it they show an OpenStreetMap map snippet. Feed review cards keep a placeholder until reviewers can upload their own photos. Hours and prices are not fabricated. A plan’s **proposed meal allowance is not a restaurant price**.

OpenStreetMap data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), under ODbL; source links are retained with each listing, and the app credits OSM on the profile screen. Venue photos, street addresses for OSM venues without one, and the place-page map come from Google Maps Platform and are shown with Google’s attribution.

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
| `public/app.js` | Mobile screens, view stack, and interactions |
| `public/styles.css` | Disco’s party-flyer design system (tokens taken from `App Mockups.html`) |
| `public/qr.js` | Small QR encoder for invite links |
| `public/fonts/` | Self-hosted Bricolage Grotesque, Hanken Grotesk, and Caveat (SIL OFL; see `OFL.txt`) |
| `public/demo.*` | Four-phone demonstration layout |
| `tests/flow.test.mjs` | Core behavioral and privacy checks |

See `docs/DEMO.md` for the short presentation path and `docs/TEAM.md` for work ownership and API contracts.
