/**
 * useEmail — Hook for DeepSpace email integration in the CRM.
 *
 * Email status: Uses the auth user's email from the session.
 * Send email: Uses the `email/send` integration endpoint on the new API worker.
 *
 * NOTE: The old Miyagi `my-email-address` / `send-user-email` endpoints
 * don't exist on the new DeepSpace API worker. The new API has `email/send`
 * (two-segment integration endpoint) which requires a `from` address.
 * For email status, we derive it from the signed-in user's email.
 */

import { useState, useCallback } from 'react'
import { integration, useUser } from 'deepspace'

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
  const [isSending, setIsSending] = useState(false)

  // Derive email from the authenticated user
  const emailAddress = user?.email ?? null
  const hasEmail = !!emailAddress

  const sendEmail = useCallback(async (params: SendEmailParams): Promise<SendEmailResult> => {
    if (!emailAddress) {
      return { success: false, error: 'No email address available' }
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

  const refreshEmailStatus = useCallback(() => {
    // No-op — email status is derived from auth user session
  }, [])

  return {
    isLoading: false,
    emailAddress,
    hasEmail,
    isSending,
    sendEmail,
    refreshEmailStatus,
  }
}
