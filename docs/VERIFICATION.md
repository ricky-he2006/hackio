# First-version verification

## Automated

The current suite passes with Node 24.22.1. `npm run check` reports 50 passing tests, including:

- Password login and session revocation for all four prepared accounts.
- Full negotiation → approval → invitations → RSVP → private change → reapproval → reconfirmation → simulated booking.
- Privacy projections with unique secret markers; other users never receive them.
- No automatic invites, stale approval rejection, changed-constraint rejection, and expired-invite handling.
- No-solution behavior after at most three rounds.
- Temporary chat context versus explicitly consented permanent memory, plus forgetting.
- Friend-attributed ranking changes after reviews.
- The exact phrase “Can’t do 8:30, could do 9” produces a 9 pm evening proposal.
- Atomic validation of edits, price checks, and media category filtering.
- Two-stop duration/cost checks and independent venue fact caches.
- Per-person model context and removal of model-generated prose from negotiation messages.
- Gemini/NVIDIA HTTP contract tests with stubbed responses; uncited web claims stay unverified.
- HTTP authentication, cross-origin rejection, source-file isolation, and calendar-export gating.
- Privacy-safe friend profile projections and non-friend rejection.
- Review edit/delete ownership and recommendation cleanup.
- Viewer-scoped notification projections with private-change redaction.
- Invite-link preview states and duplicate-safe friend requests.
- Ephemeral location-aware distance calculations with OSU fallback validation.

## Browser walkthrough

Verified using the running app:

1. Logged into the four accounts through the demo toolbar.
2. Selected all three friends as Ricky and started a plan.
3. Observed negotiation converge and require approval.
4. Approved and observed live invitations in all three friend sessions.
5. Accepted as Aditya, Arnav, and Daniel and observed all four views become confirmed.
6. Sent Arnav’s availability change privately; verified the host’s 8:30 → 9:00 diff.
7. Approved the change and observed reconfirmation states.
8. Used the review form as Daniel to post a clearly labeled demo opinion of North Market Downtown; verified it appeared immediately in the feed.
9. Visually checked the four-phone layout, mobile feed, catalog search, review form, approval view, and private change form.
10. Automated checks cover friend profile browsing, review management, notification inbox projections, invite-link resolution, and near-me fallback validation; browser visual walkthrough remains pending because no browser surface was available in this restricted environment.

The reviewed UI contains that rehearsal plan and the clearly labeled demo review. The local SQLite database preserves them; it is not committed. Screenshot capture was unavailable in the restricted browser environment; the manual checks and automated projections remain reproducible with `npm run check`.

## Not yet verified against external services

No API keys were provided. Real Gemini/NVIDIA calls, provider latency/quotas, and actual Google Search results remain untested. The running app uses labeled local deterministic agents. Booking is simulated by design; calendar-account sync is deferred.
