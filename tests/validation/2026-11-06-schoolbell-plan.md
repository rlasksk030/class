# Issue #4 implementation plan

Baseline: `feature/timer-pip-nationwide` at `b296c2a6416ba9b4945de7382b5788299e37dfd6`. Work branch: `feature/schoolbell-diary-nationwide`.

1. Preserve common drafts/photos and all HiClass publishing behavior. Add per-class service selection, defaulting to HiClass.
2. Add isolated Schoolbell-E login windows, teacher-entered school/class comparison and explicit manual confirmation. Do not inspect credentials or invoke private APIs.
3. Keep automatic Schoolbell-E publishing BLOCKED. Provide text copy, ordered photo export and a manual handoff ledger. Pending/uncertain handoffs require outcome reconciliation before preparing another copy. User-confirmed publication remains distinct from verified server success.
4. Isolate service sessions and ledgers by school, academic year and class. Preserve legacy HiClass session for its existing class without copying cookies to other classes.
5. Run baseline and changed-code unit tests, Electron regression, independent review and local Windows tests with synthetic data. Record NOT RUN/BLOCKED accurately. Create a Draft PR against the specified base; no merge or deployment.

Official research (2026-11-06): the [current official web manual](https://schoolbell-e.oopy.io/webmanual) links to [class-page diary writing](https://schoolbell-e.oopy.io/1fa563b6-9642-80ab-b7ad-fb6b5c9bdf15), including manual attachments, drafts and scheduling. [Board integration](https://schoolbell-e.oopy.io/board_link) describes school-website-to-Schoolbell syndication, not a third-party teacher diary posting API. The [terms](https://schoolbell-e.oopy.io/terms) do not establish an external posting API contract. No public posting API specification or permission was found in the reviewed official sources. This is an unconfirmed capability, not a claim that no private partner API exists. No vendor contact or real account posting authorized/performed.

CI baseline: 19 runs, latest `41977391612` success. Existing push trigger only matches the old validation branch, not this work branch; no PR trigger. Expected new runs: 0, additional Actions usage/cost: 0. Account-wide billing endpoint returned 404 with missing `user` scope; no permission/budget changes requested. Existing published v1.8.11 editions, downloads and feeds are outside this change.
