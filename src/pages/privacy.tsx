/**
 * Privacy Policy — public page.
 *
 * Required for Google OAuth verification of restricted scopes
 * (gmail.readonly). Linked from the OAuth consent screen and the
 * app footer. The Limited Use disclosure paragraph is verbatim
 * the wording Google's verification reviewers check for.
 */

import { Link } from 'react-router-dom'

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10 text-sm leading-relaxed text-foreground">
      <Link to="/" className="text-xs text-muted-foreground hover:underline">
        ← Back to app
      </Link>

      <h1 className="mt-4 mb-2 text-2xl font-semibold">Privacy Policy</h1>
      <p className="text-xs text-muted-foreground mb-8">
        Last updated: May 18, 2026
      </p>

      <section className="space-y-4">
        <h2 className="text-base font-semibold">Who we are</h2>
        <p>
          DeepSpace CRM is operated by Eudaimonic Inc. ("we", "us"). The
          application is a customer-relationship management tool that lets a
          signed-in user manage contacts, companies, deals, and activities,
          and view their own Gmail inbox alongside those records.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-base font-semibold">What data we collect</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Account information</strong> — your name, email, and
            profile image, supplied by your sign-in provider.
          </li>
          <li>
            <strong>CRM records you create</strong> — contacts, companies,
            deals, pipeline stages, and activities. These are stored in a
            per-user Durable Object instance that only your account can
            access.
          </li>
          <li>
            <strong>Google account access tokens</strong> — when you connect
            your Gmail inbox, we store the OAuth access and refresh tokens
            issued by Google. Tokens are encrypted at rest with AES-256-GCM
            (key derived per-instance from a worker secret via HKDF-SHA256)
            and transmitted only over TLS.
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-base font-semibold">Google user data</h2>
        <p>
          When you connect your Google account we request the{' '}
          <code className="rounded bg-secondary/40 px-1.5 py-0.5 text-xs">
            gmail.readonly
          </code>{' '}
          scope to read your mail. We use it to:
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>Display your recent inbox in the Email tab.</li>
          <li>
            Display threads filtered by a contact's email address on that
            contact's detail page.
          </li>
          <li>
            Display threads with any contact linked to a deal on that
            deal's detail page.
          </li>
          <li>Display a "recent emails" summary on the dashboard.</li>
        </ul>
        <p>
          When you first compose, reply, mark read/unread, star, archive, or
          trash a message from the CRM, we additionally request the{' '}
          <code className="rounded bg-secondary/40 px-1.5 py-0.5 text-xs">
            gmail.modify
          </code>{' '}
          scope. We use it only to carry out the specific action you take:
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Send / reply</strong> — send a message you compose, on your
            behalf, from your own Gmail account.
          </li>
          <li>
            <strong>Mark read / unread</strong> — add or remove the{' '}
            <code className="rounded bg-secondary/40 px-1.5 py-0.5 text-xs">UNREAD</code>{' '}
            label on a message or thread you select.
          </li>
          <li>
            <strong>Star / unstar</strong> — add or remove the{' '}
            <code className="rounded bg-secondary/40 px-1.5 py-0.5 text-xs">STARRED</code>{' '}
            label to flag a contact&apos;s emails as important.
          </li>
          <li>
            <strong>Archive</strong> — remove a message or thread from your
            inbox (remove the{' '}
            <code className="rounded bg-secondary/40 px-1.5 py-0.5 text-xs">INBOX</code>{' '}
            label).
          </li>
          <li>
            <strong>Trash</strong> — move a message or thread to Trash, where
            it remains recoverable.
          </li>
        </ul>
        <p>
          We never permanently delete mail — we do not request the full{' '}
          <code className="rounded bg-secondary/40 px-1.5 py-0.5 text-xs">
            mail.google.com
          </code>{' '}
          scope, and Trash deletions stay recoverable in Gmail. Every action is
          initiated by an explicit click; the CRM never sends or modifies mail
          on its own, and no automated agent has access to these capabilities.
          Message bodies are not cached or stored on our servers; every request
          goes straight to and from the Gmail API.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-base font-semibold">Limited Use disclosure</h2>
        <p className="rounded-md border border-border bg-secondary/20 p-3">
          DeepSpace CRM's use and transfer to any other app of information
          received from Google APIs will adhere to{' '}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-base font-semibold">How to disconnect or delete your data</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Disconnect Gmail.</strong> Open the Email tab and click
            "Disconnect". We immediately revoke the token at Google and
            delete it from our database. You can also revoke access at any
            time from{' '}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              myaccount.google.com/permissions
            </a>
            .
          </li>
          <li>
            <strong>Delete your CRM data.</strong> Email{' '}
            <a
              href="mailto:mcapi@eudaimonic.one"
              className="text-primary hover:underline"
            >
              mcapi@eudaimonic.one
            </a>{' '}
            and we will erase your Durable Object instance within 30 days.
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-base font-semibold">Sharing and transfers</h2>
        <p>
          We do not sell your data. We do not share Google user data with
          third parties beyond the user's own browser. We do not use Google
          user data for advertising or for training generalised AI/ML
          models.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-base font-semibold">Contact</h2>
        <p>
          Questions about this policy:{' '}
          <a
            href="mailto:mcapi@eudaimonic.one"
            className="text-primary hover:underline"
          >
            mcapi@eudaimonic.one
          </a>
          .
        </p>
      </section>
    </div>
  )
}
