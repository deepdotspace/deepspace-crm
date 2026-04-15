/**
 * useEmail — Hook for DeepSpace email integration in the CRM.
 * Checks if user has an @app.space email handle, provides sendEmail function.
 */

import { useState, useEffect, useCallback } from 'react'
import { mcapi } from '@spaces/sdk/mcapi'

interface EmailState {
  /** Whether the email status is being loaded */
  isLoading: boolean
  /** The user's full email address (e.g. "daniel@app.space") */
  emailAddress: string | null
  /** Whether the user has claimed an email handle */
  hasEmail: boolean
}

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
  const [state, setState] = useState<EmailState>({
    isLoading: true,
    emailAddress: null,
    hasEmail: false,
  })
  const [isSending, setIsSending] = useState(false)

  // Check email handle on mount
  useEffect(() => {
    mcapi.get<{ success: boolean; data: { claimed?: boolean; emailAddress?: string | null } }>('my-email-address')
      .then((res) => {
        setState({
          isLoading: false,
          emailAddress: res.data?.emailAddress ?? null,
          hasEmail: !!res.data?.claimed,
        })
      })
      .catch(() => {
        setState({ isLoading: false, emailAddress: null, hasEmail: false })
      })
  }, [])

  const refreshEmailStatus = useCallback(() => {
    mcapi.get<{ success: boolean; data: { claimed?: boolean; emailAddress?: string | null } }>('my-email-address')
      .then((res) => {
        setState({
          isLoading: false,
          emailAddress: res.data?.emailAddress ?? null,
          hasEmail: !!res.data?.claimed,
        })
      })
      .catch(() => {})
  }, [])

  const sendEmail = useCallback(async (params: SendEmailParams): Promise<SendEmailResult> => {
    setIsSending(true)
    try {
      const result = await mcapi.post<SendEmailResult>('send-user-email', {
        to: params.to,
        cc: params.cc,
        bcc: params.bcc,
        subject: params.subject,
        html: params.html,
        text: params.text,
      })
      return result
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to send email',
      }
    } finally {
      setIsSending(false)
    }
  }, [])

  return {
    ...state,
    isSending,
    sendEmail,
    refreshEmailStatus,
  }
}
