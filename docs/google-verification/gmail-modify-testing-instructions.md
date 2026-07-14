# Google OAuth verification — gmail.modify testing instructions

Draft of the testing-information text + demo-video shot list for the
resubmission. Written after the first review round granted `gmail.send`
and left `gmail.modify` as "justification needed."

## Why the first round failed (root cause, internal)

The tester was right: the consent screen never showed `gmail.modify`.

- The SDK's `gmail.modify` support (branch `more-scopes`) was never merged
  to main, so a later api-worker deploy from main reverted it: the
  mailbox-mutation endpoints (`gmail-mark-read`, `gmail-archive`,
  `gmail-star`, `gmail-trash`, …) disappeared from production, and
  `gmail-send`'s consent fallback reverted to requesting the narrower
  `gmail.send` scope.
- So the tester's Send click produced a consent popup listing `gmail.send`
  only, and the star/archive features errored server-side (unknown
  endpoint). Google granted what they saw: `gmail.send`.

**Pre-flight checklist before resubmitting (in order):**

1. Merge SDK branch `more-scopes` → main (PR under review).
2. Deploy the api-worker (`pnpm run deploy` from `platform/api-worker`).
3. Verify the live catalog lists the mutation endpoints:
   `curl -s https://deepspace-crm.app.space/api/integrations | grep gmail-star`
4. Verify the consent URL now carries gmail.modify: trigger any write
   endpoint with a Google-disconnected account and check the returned
   `authUrl` contains `scope=...gmail.modify`.
5. Deploy this CRM (`npx deepspace deploy`) so the always-visible
   mailbox actions + Starred/Unread views are live.
6. Re-record the demo video (shot list below).

## Testing information (text for the Cloud Console / reply email)

> You can proceed by:
>
> 1. Open https://deepspace-crm.app.space and click **"Sign in with email"**
>    on the authentication popup.
> 2. Credentials: email `casa.deepspace.review@gmail.com`, password
>    `<password>`. (This is a real Google account we created for review
>    purposes, seeded as a DeepSpace user — please use "Sign in with
>    email", not "Sign in with Google".)
> 3. Go to the **Email** tab (https://deepspace-crm.app.space/email). The
>    inbox is already connected with read-only access (`gmail.readonly`).
>    Every message row shows the CRM's mailbox actions: **Star, Reply,
>    Mark read/unread, Archive, Trash**.
> 4. Click any write action — e.g. the **Star** icon on a message, or
>    **Compose → Send**. Because the account has only granted
>    `gmail.readonly` so far, the app opens the Google consent popup
>    requesting **`gmail.modify`** (incremental auth). This single scope
>    covers our entire write surface: send, mark read/unread, star,
>    archive, and trash. After consent, the action completes and a toast
>    confirms the change in Gmail.
> 5. To see each `gmail.modify` capability:
>    - **Star** a message, then click the **Starred** view above the list —
>      the message appears there (and under Starred in Gmail itself).
>    - **Mark read/unread** — the unread dot and bold styling update; the
>      **Unread** view scopes the list to unread mail.
>    - **Archive** — the message leaves the Inbox view (still in All Mail
>      in Gmail).
>    - **Trash** — the message moves to Gmail's Trash (recoverable for 30
>      days; we intentionally do not request the full `mail.google.com`
>      scope because the app never permanently deletes mail).
>    - **Compose / Reply → Send** — sends through the user's Gmail;
>      replies thread correctly.
>    - The same star action is available on contact and deal pages
>      (Contacts → open a contact → recent emails list), where flagging a
>      customer email is a CRM workflow.
> 6. Every action is user-initiated from an explicit click. The app never
>    sends or modifies mail on its own, and no write capability is exposed
>    to the AI assistant surface.

## Demo video shot list (~2 minutes)

1. **Consent proof first.** Signed in, Gmail connected read-only. Click
   Star on a message → the Google consent popup appears — pause and zoom
   on the scope text ("Read, compose, and send emails…" / gmail.modify) so
   the reviewer can read it. Grant.
2. **Star + proof.** The star fills; toast "Starred in Gmail". Click the
   **Starred** view — the message is there. Switch to mail.google.com in
   another tab, show the same message under Starred.
3. **Mark read/unread.** Toggle both ways on one message; show the Unread
   view narrowing.
4. **Archive.** Archive a message; toast; show it gone from Inbox and
   present in Gmail's All Mail.
5. **Trash.** Trash a message; toast says "recoverable"; show it in
   Gmail's Trash.
6. **Compose/Reply → Send** from a contact page (CRM context: the email is
   logged to the contact's timeline). Show the sent mail in Gmail's Sent.
7. End on the scope notice banner in the Email tab ("Reading uses
   gmail.readonly… star, archive, trash use gmail.modify… we never
   permanently delete mail").

## Scope justification (unchanged, for reference)

Productivity use case: act on your own mailbox from within the CRM:
compose/reply and send, mark read/unread, star/unstar, archive, and move
to Trash, each from an explicit click on a contact, deal, or the in-app
inbox; each action is automatically logged to the CRM timeline. Every
action is user-initiated; the app never sends or modifies mail on its own,
and these write capabilities are not exposed to any automated or AI agent.
We intentionally do NOT request the full `https://mail.google.com/` scope
because we never permanently delete mail. `gmail.modify` is the single
narrowest scope that covers send + label changes + trash.
