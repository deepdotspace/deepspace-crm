/**
 * Terms of Service — public page.
 *
 * Required for Google OAuth verification of restricted scopes.
 * Linked from the OAuth consent screen and the app footer.
 */

import { Link } from 'react-router-dom'

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10 text-sm leading-relaxed text-foreground">
      <Link to="/" className="text-xs text-muted-foreground hover:underline">
        ← Back to app
      </Link>

      <h1 className="mt-4 mb-2 text-2xl font-semibold">Terms of Service</h1>
      <p className="text-xs text-muted-foreground mb-8">
        Last updated: May 18, 2026
      </p>

      <section className="space-y-4">
        <h2 className="text-base font-semibold">1. Acceptance</h2>
        <p>
          By signing in to DeepSpace CRM ("the Service") you agree to these
          Terms of Service and to our{' '}
          <Link to="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
          . If you do not agree, do not use the Service.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-base font-semibold">2. The Service</h2>
        <p>
          The Service provides customer-relationship-management features —
          contacts, companies, deals, pipeline stages, activities — and an
          optional read-only view of the signed-in user's Gmail inbox via
          the Google Gmail API.
        </p>
        <p>
          The Service is operated by Eudaimonic Inc. on Cloudflare
          infrastructure. Each user's CRM data is stored in a per-user
          Durable Object instance isolated from every other user's data.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-base font-semibold">3. Your account</h2>
        <p>
          You are responsible for maintaining the security of your sign-in
          credentials and for all activity under your account. Sign-in is
          provided by the identity provider you chose at the consent
          screen.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-base font-semibold">4. Google account access</h2>
        <p>
          If you connect a Google account, you grant the Service permission
          to read your Gmail mailbox via the{' '}
          <code className="rounded bg-secondary/40 px-1.5 py-0.5 text-xs">
            gmail.readonly
          </code>{' '}
          scope. When you choose to compose, reply, mark read/unread, star,
          archive, or trash a message from within the CRM, you additionally
          grant the{' '}
          <code className="rounded bg-secondary/40 px-1.5 py-0.5 text-xs">
            gmail.modify
          </code>{' '}
          scope, which the Service uses only to perform the action you
          initiate. The Service never permanently deletes messages (it does not
          request the full{' '}
          <code className="rounded bg-secondary/40 px-1.5 py-0.5 text-xs">
            mail.google.com
          </code>{' '}
          scope) and never sends or modifies mail without an explicit action by
          you. You may revoke this access at any time by clicking
          "Disconnect" in the Email tab or by visiting{' '}
          <a
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            myaccount.google.com/permissions
          </a>
          . See the{' '}
          <Link to="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>{' '}
          for details on how Google user data is handled.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-base font-semibold">5. Acceptable use</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Do not attempt to access another user's account or data.</li>
          <li>Do not use the Service to send unlawful or harmful content.</li>
          <li>Do not reverse-engineer, scrape, or rate-abuse the Service.</li>
          <li>
            Do not use the Service to violate Google's{' '}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              API Services User Data Policy
            </a>
            .
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-base font-semibold">6. Warranty disclaimer</h2>
        <p>
          The Service is provided "as is" without warranty of any kind. To
          the maximum extent permitted by law, we disclaim all implied
          warranties of merchantability, fitness for a particular purpose,
          and non-infringement.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-base font-semibold">7. Limitation of liability</h2>
        <p>
          To the extent permitted by law, Eudaimonic Inc. is not liable for
          indirect, incidental, consequential, special, or punitive
          damages arising out of your use of the Service.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-base font-semibold">8. Termination</h2>
        <p>
          You may stop using the Service at any time. We may suspend or
          terminate accounts that violate these Terms. On termination, we
          will delete your stored data on request — see the Privacy Policy
          for details.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-base font-semibold">9. Changes</h2>
        <p>
          We may update these Terms. Material changes will be announced in
          the app or by email. Continued use after a change constitutes
          acceptance of the updated Terms.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-base font-semibold">10. Contact</h2>
        <p>
          Questions:{' '}
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
