# Verification

Follow-up audit run on October 24, 2026.

## Automated checks

`npm run check` passes all 126 tests (102 existing, 24 audit regressions). The new regression coverage exercises:

- Plan approval revisions, RSVP constraint rechecks, declines, repeated revisions, recovery of the last approved route, and legacy invitations.
- Proactive consent invalidation, expiry, allowlists, notification delivery limits, and idempotent plan starts without private plan data.
- Private chat authorization and thread context, outing-time parsing, busy-time matching, and closed-hours checks.
- Negative dietary evidence, separately stated hard needs, out-of-order memory deletion, atomic night ratings, and review-to-adventure links.
- Invalid JSON request bodies and unsupported opening-hours syntax.

The existing suite also covers login, authorization, privacy projections, plan negotiation, reviews, uploads, provider adapters, cross-origin checks, encryption, and static-file isolation.

## Browser walkthrough

`npm run test:browser` uses a fresh in-memory database and local demo agents. It passed on Chrome at a 390 × 844 mobile viewport and in the 1600 pixel four-phone presentation. The walkthrough covered login and onboarding, chat recommendations, place details and saves, review posting, settings edits while live updates arrive, friend profiles, adventure drafting and host approval, guest RSVP, `.ics` download, feed likes and comments, notifications, retry after a failed detail request, friend requests, QR rendering, logout isolation, and four independent demo sessions. It reported no JavaScript errors.

The audit screenshots are in `outputs/audit-2026-10-24/`: [mobile settings](../outputs/audit-2026-10-24/settings.png), [plan](../outputs/audit-2026-10-24/plan.png), and [four-phone demo](../outputs/audit-2026-10-24/four-phone-demo.png).

Playwright is optional and is not added to the app dependencies. With Chrome installed, install it separately and run:

```sh
npm install --prefix /tmp/disco-browser-audit playwright
PLAYWRIGHT_MODULE=/tmp/disco-browser-audit/node_modules/playwright/index.mjs npm run test:browser
```

Set `CHROME_PATH` if Chrome is not discoverable by Playwright. Screenshots are written to a temporary directory printed by the script.

## Not verified against external services

No live Gemini, NVIDIA, Google Places, or grounded web lookup was called during this audit. Provider keys, model access, quota behavior, latency, current venue facts, and the accuracy of third-party dietary claims still need verification with working credentials. Strict-diet web claims currently cause a private warning to verify with the venue. Booking remains simulated; calendar-account sync is not implemented.
