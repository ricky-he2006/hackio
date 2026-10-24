# Security

Disco keeps each person's budget, diet, schedule, and reasons private, even from their friends and from the plan's host. This page lists what we protect, how, and which automated test proves each claim. Run `npm test` to check all of them. `tests/security.test.mjs` runs each attack below against a live server.

## What we protect

| Asset | Why it matters |
| --- | --- |
| Private context (budget, dietary needs, availability, private notes, memories) | The core promise: friends see conclusions, never the reasons |
| Session tokens | A stolen token is a stolen account |
| Model and search API keys, plus the spend they enable | Keys stay on the server; abuse costs real money |
| Integrity of shared data (reviews, plans, the negotiation log) | One user must not be able to corrupt another's view |

## Who we defend against

- **A curious friend in the group.** Logged in, legitimately part of the plan, wants to learn someone's budget.
- **An outsider on the web.** No account; might lure a teammate to a malicious page while Disco runs on their laptop.
- **Hostile data.** Venue names, user-added items, and web search results that try to instruct the AI.

## Protections

| Area | Protection | Proven by |
| --- | --- | --- |
| **Privacy between users** | The server builds each response from an explicit allow-list of public fields. Another person's context, chat, memories, and plan overrides never serialize. | `privacy: other contexts…` (flow tests) |
| | Each person's agent model sees only that person's context. The shared negotiation log accepts fixed phrases only ("A cheaper option is needed"), never model-written text. | `model-backed evaluators receive one private context…` |
| | **Inference:** a person sees only their own agent's accept or counter. Everyone else's lane reads "Checked privately", so a host can't tell who objected. Allowances move in $5 steps, and one person can start at most 12 negotiations involving the same friend per day. Repeated plans can't narrow a friend's budget below a $5 range. | `a host only sees their own agent's verdict…`, `repeated plans cannot narrow a friend's budget…`, `one person can start at most 12 negotiations…` |
| | Web searches contain only the venue name, date, and time. Date and time must be real values, so free text can't be smuggled in. | `web lookup has no private context…`, `web lookups only accept a real date and time…` |
| **Storage** | **Encrypted at rest:** the application state JSON (profile image blobs and hashed session records remain separate) is sealed with AES-256-GCM before it reaches SQLite, so opening `disco.sqlite` shows no budgets, diets, notes, or chat. GCM also detects tampering. The key comes from `DATA_KEY` or a generated owner-only `.key` file that git ignores. On POSIX systems the database files are owner-only (`600`). Windows uses inherited filesystem ACLs; Node chmod does not enforce owner-only access there. Old unencrypted databases are re-sealed and rebuilt on first start, so no plaintext stays behind on disk. | `encryption at rest: the database holds only ciphertext…`, `…sealed on first start` |
| **Authorization** | Every plan action (approve, RSVP, request a change, cancel, book, calendar) is tested as the host, an invitee, a friend who wasn't invited, and a logged-out caller. Refused calls leave the plan byte-for-byte unchanged. Invitees can't see a plan before the host approves it, and only the host can change the time or venue. | `authorization matrix…` |
| **Accounts** | Passwords are hashed with scrypt and a per-user salt, and compared in constant time. | `prepared users authenticate…` |
| | Tokens are 256-bit random values. The server stores only their SHA-256 hash, they expire after 24 hours, and they die on logout. | `session tokens die on logout…` |
| | Brute force: 30 login attempts per minute per address, and 10 failed attempts lock an account for 15 minutes. | `repeated wrong passwords lock that account…` |
| | The login screen shows the demo password only while the default is in use. Set `DEMO_PASSWORD` on a fresh database and the hint disappears. | `the login screen only shows the demo password…` |
| **Browser** | Content Security Policy allows scripts only from Disco's own origin: no inline scripts, no `eval`, no third-party scripts. Every user-supplied value is HTML-escaped before rendering, and links are restricted to `http`/`https`. | `security headers are set…` |
| | `nosniff`, `frame-ancestors 'self'`, `Cross-Origin-Opener-Policy`, `Permissions-Policy`, and a same-origin `Referrer-Policy`. | `security headers are set…` |
| | Google search suggestions render in a sandboxed iframe with no script access. Messages between the demo page and phones are origin-checked. | Code: `public/app.js`, `public/demo.js` |
| **Cross-site attacks** | API calls require a bearer token, not a cookie, so other sites can't ride a session. State-changing requests from another origin are rejected. | `HTTP auth boundary…` |
| | **DNS rebinding:** a malicious page can make a browser talk to `127.0.0.1` under the attacker's own hostname. Disco refuses any `Host` it doesn't serve, so even the public demo password is useless from there. | `DNS rebinding…` |
| **Server robustness** | Most request bodies are capped at 24 KB; validated profile image uploads use a separate size limit. Static files are served only from `public/`, and path tricks return 404. | `path tricks and malformed escapes…` |
| | Ids sent by clients are looked up in maps that have no JavaScript prototype, so names like `constructor` can't pose as a place or user. | `prototype-named ids…` |
| | Each account may open at most 8 live-update connections. | Code: `server.mjs` |
| **AI and cost** | Per user: 20 model or search calls per minute (chat, planning, web lookup) and 120 writes per minute. | `model and web-search calls are rate-limited…` |
| | **Prompt injection:** model output is parsed as data and validated. A fully hijacked model can't accept a plan on someone's behalf (their own constraint check still says no), leak prose, invent reason codes, or act on items it wasn't shown. Venue names reach the search prompt as quoted JSON data, and uncited web claims never count as verified. | `prompt injection: …` (3 tests), `model-backed evaluators…`, `web lookup…` |
| **Pipeline** | GitHub Actions runs the syntax check and all tests, plus a gitleaks scan of the full git history, on every push and pull request. The history scan is currently clean. | `.github/workflows/ci.yml` |

## Issues found and fixed in our security review

| Severity | Issue | Fix |
| --- | --- | --- |
| High | One request with a malformed `Host` header crashed the whole server (an unhandled error). No login needed. | Host validation and URL parsing now happen inside error handling, and unknown hosts get `421`. |
| High | A review attached to the "place" `constructor` was saved, then permanently broke the app for the author **and their friends**, because they see each other's reviews. | Prototype-free lookup maps, plus a regression test. |
| High | **Budget inference.** No field leaked, but the host saw each friend's accept or counter, and the fallback allowance stepped to $18. By proposing a few allowances to a single friend, a host could learn that friend's exact private budget. We reproduced this against a seeded account. | Others' verdicts are hidden, allowances move in $5 steps, and negotiations per friend are capped daily. |
| Medium | The chat model could name any place id, including ones it was never shown. A hostile item name in a user's message could steer it into posting or overwriting a review in that user's name. | Only offered ids are accepted. |
| Medium | Private data was stored unencrypted, in a database file any account on the machine could read. | AES-256-GCM at rest, owner-only files, and old plaintext pages purged when a database is migrated. |
| Medium | DNS rebinding plus the published demo password let any website log in to a locally running Disco and read private context. | `Host` allow-list (`ALLOWED_HOSTS` adds deployed hostnames). |
| Medium | No per-user limit on calls that reach paid AI and search APIs. | Per-user rate limits. |
| Medium | No per-account lockout; the only limit was per network address. | 10 failures lock an account for 15 minutes. |
| Low | Web lookups accepted free-text dates and times, which went into the search prompt. | Strict date/time validation. |
| Low | The login screen always displayed the default password. | Shown only while it's still the default. |

## Known limits

We're stating these up front rather than overclaiming:

- **Trusted server.** The running server holds the key and can read every private context. Separation between agents is enforced by the code, not by cryptography. Encryption at rest protects a copied or leaked database file, not a compromised running server.
- **Key placement.** Without `DATA_KEY`, the key file sits next to the database. That protects against sharing or backing up the database alone, but not against someone who takes the whole `data/` folder. Set `DATA_KEY` from a secret manager in any real deployment. Losing the key means losing the data.
- **Model providers see the context.** When Gemini or NVIDIA is enabled, each person's own context goes to that provider to evaluate their plan. Local mode sends nothing anywhere.
- **No HTTPS in local mode.** The server binds to loopback only. A deployment must sit behind TLS (with HSTS) and set `ALLOWED_HOSTS`.
- **Rate limits live in memory.** They reset on restart and assume a single server process.
- **Demo accounts.** There are four prepared accounts that share one password, with no sign-up, password change, or 2FA.
- **Inference is bounded, not eliminated.** Planning needs a yes or no, and any yes/no answer reveals something. With one invitee, "a cheaper option is needed" is obviously that person's answer. The protections keep what a host can learn coarse (a $5 range) and slow to collect (12 negotiations per friend per day). Proposed times aren't rounded, so a determined host could still estimate a friend's start time within that daily cap.
- **Prompt injection is contained, not eliminated.** Hostile text in a venue name or web page can still mislead a model's yes/no answer. It can't take actions, leak private values into the shared channel, or turn an unsourced claim into a verified fact.

## Before a public deployment

1. TLS with HSTS, plus `ALLOWED_HOSTS=<your domain>`.
2. Real accounts: sign-up, password change, per-user passwords, and optional 2FA.
3. `DATA_KEY` held in a secret manager, with a key-rotation procedure.
4. Shared rate limiting (for example, Redis) and alerts on API spend.
5. Dependency scanning in CI once the app has dependencies (today it has none).

## Reporting

Found something? Tell the team privately before posting it anywhere.
