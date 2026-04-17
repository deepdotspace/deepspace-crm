/**
 * useEmail — DeepSpace email integration for the CRM.
 *
 * The user's @app.space identity is owned by the deepspace-mail app: it
 * writes to the `email_handles` collection in `workspace:default`. Any
 * other app (us) can read that collection by registering it as a shared
 * scope in `_app.tsx`. We never write here — claiming a handle is
 * exclusively done in deepspace-mail (mail.app.space).
 *
 * Flow:
 *   - has handle → emailAddress is the @app.space address; sendEmail uses
 *     it as the FROM via the `email/send` integration on the api-worker.
 *   - no handle → hasEmail is false; the email tab and the compose dialog
 *     prompt the user to set one up at https://deepspace-mail.app.space.
 *
 * Caveat: inbound from external providers (e.g. hotmail → a@app.space)
 * is currently not supported. CRM contacts that happen to be @app.space
 * users won't actually receive these messages — outbound to real
 * external mailboxes is the supported path here.
 */

import { useState, useCallback, useMemo } from 'react'
import { integration, useQuery, useUser } from 'deepspace'

interface SendEmailParams {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  html: string
  text?: string
}

interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
  rateLimited?: boolean
}

export function useEmail() {
  const { user } = useUser()
  const { records, status } = useQuery<Record<string, unknown>>('email_handles')
  const [isSending, setIsSending] = useState(false)

  const myHandle = useMemo(() => {
    if (!user?.id) return null
    return records.find(r => r.data.UserId === user.id) ?? null
  }, [records, user?.id])

  const emailAddress = (myHandle?.data.EmailAddress as string) ?? null
  const hasEmail = !!myHandle

  const sendEmail = useCallback(async (params: SendEmailParams): Promise<SendEmailResult> => {
    if (!emailAddress) {
      return { success: false, error: 'No @app.space email handle claimed' }
    }
    setIsSending(true)
    try {
      const result = await integration.post<{ id?: string }>('email/send', {
        from: emailAddress,
        to: params.to,
        cc: params.cc,
        bcc: params.bcc,
        subject: params.subject,
        html: params.html,
        text: params.text,
      })
      if (result.success) {
        return { success: true, messageId: result.data?.id }
      }
      return {
        success: false,
        error: result.error ?? 'Failed to send email',
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to send email',
      }
    } finally {
      setIsSending(false)
    }
  }, [emailAddress])

  // No-op kept for API compatibility — handle changes flow in via the
  // workspace:default subscription automatically.
  const refreshEmailStatus = useCallback(() => {}, [])

  return {
    isLoading: status === 'loading',
    emailAddress,
    hasEmail,
    isSending,
    sendEmail,
    refreshEmailStatus,
  }
}
