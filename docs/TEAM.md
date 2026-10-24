# Team handoff and agreed scope

The first version uses a zero-dependency Node/SQLite server and browser-native ES modules to make a working clone fast to run on all four teammates’ machines. It preserves the agreed mobile UI and provider-swappable architecture. There is no frontend package installation or build step. The originally discussed Next.js/Tailwind stack is not used in this implementation.

## Four work areas

| Owner | Files | Next useful work |
| --- | --- | --- |
| UI | `public/app.js`, `public/styles.css` | Phone QA, accessibility, review/plan polish |
| Agent logic | `lib/engine.mjs`, `lib/providers.mjs` | Live-provider verification, broader chat intents, time/constraint matching |
| Data | `lib/data.mjs`, `scripts/import_seed.py`, `data/seed.json` | Venue deduplication, source quality, availability imports |
| Integration/demo | `server.mjs`, `public/demo.*`, `tests/`, `docs/` | Rehearsal, latency measurements, merge checks, presentation |

These are proposed human ownership boundaries, not separate AI agents. Avoid simultaneous edits to the same file. Share source changes through your chosen Git remote; credentials and local databases stay untracked. No remote has been configured or pushed by this build.

## Shared contracts

All API routes are same-origin. Authenticate with `Authorization: Bearer <session token>`. Tokens are returned by login and stored per browser session/phone. Error response: `{error: string}` with a meaningful HTTP status.

| Route | Request / response |
| --- | --- |
| `GET /api/accounts` | Public prepared usernames, names, and avatar colors |
| `POST /api/login` | `{username,password}` → `{token,user}` |
| `POST /api/logout` | Revoke current token |
| `GET /api/state` | Authorized user projection; private fields only under `me` and own chat |
| `GET /api/events` | SSE revision notifications; no application/private payload |
| `POST /api/chat` | `{text,planId?}` → intent handling and authorized mutations |
| `POST /api/settings` | Own `{budget,start,end,days,dietary,preferences,interests,energy}` |
| `POST /api/memory` | `{action:save|skip,pendingId}` or `{action:forget,memoryId}` |
| `GET /api/catalog?q=...` | Search public item catalog |
| `GET /api/place?id=...` | Place details with reviews visible through the user’s graph |
| `POST /api/reviews` | `{placeId,rating,quote,tags}`; replaces author’s prior review of that item |
| `POST /api/items` | `{name,category}`; add a reviewable non-venue item or unverified place |
| `POST /api/facts` | `{placeId,date,time}`; public grounded web lookup, cached 15 minutes |
| `POST /api/plans` | `{friends,title,date,time,allowance,placeId?,query?}` |
| `POST /api/plans/approve` | `{planId,revision}`; host-only, stale versions rejected |
| `POST /api/plans/rsvp` | `{planId,response:in|out}` |
| `POST /api/plans/revise` | `{planId,constraints?}` for own private changes; host can send `option` or `another:true` |
| `POST /api/plans/cancel` | `{planId}`; host-only |
| `POST /api/plans/book` | `{planId}`; host-only simulated confirmation after all accept |
| `GET /api/calendar?id=...` | Download `.ics` for a confirmed plan |

## State machine

`drafting → negotiating → awaiting_approval → invited → confirmed → booked`

- No convergence or a decline → `needs_decision`.
- A host tweak or an invitee’s new constraint → `negotiating`, then approval again.
- Previously accepted invitees receive `reconfirm` after an approved change.
- Only the host can cancel. Agents never edit the participant list.
- `booked` is explicitly a demo simulation, not a completed external transaction.

## Current boundaries

- Restaurants/cafés are the working planning focus. Other categories can be entered/reviewed/recommended but do not form multi-stop routes yet.
- Availability is recurring day-of-week plus one daily window; not a full imported calendar.
- Website lookup is Gemini search grounding, not unrestricted browser automation.
- Only the four prepared users have active login/negotiation sessions. The 32 additional people contribute seeded opinions; requests to them do not auto-accept.
- Ordinary profile updates affect future evaluations; active plans are revised by an explicit chat/change request.
- Monthly memory check-ins, external account imports, real reservations/payments, calendar sync, and broader production onboarding remain future work.

## Required checks before merging

Run `npm run check`, then inspect `/demo` on a laptop and `/` at phone width. Rehearse one full approval/reconfirmation cycle. If changing serialization, add a privacy regression test that puts a unique marker in another user’s context and verifies it cannot enter the caller’s state.
