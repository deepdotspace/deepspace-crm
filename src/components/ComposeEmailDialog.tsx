/**
 * ComposeEmailDialog — CRM email compose / reply dialog.
 *
 * Sends through the signed-in user's Gmail account via the SDK
 * `google/gmail-send` endpoint (gmail.modify scope), and auto-logs the
 * send as a CRM activity. If the user hasn't yet granted write access,
 * the first send transparently opens the Google consent popup (handled
 * inside useGmailWrite) and replays the send.
 *
 * Pass `threadId` to send as a reply within an existing Gmail thread —
 * the SDK resolves the In-Reply-To / References headers so the recipient's
 * client threads it correctly.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useCrm } from '../platform/CrmPlatformProvider'
import { useGmailWrite } from '../platform/useGmailWrite'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Button, Input, Label, Textarea,
} from './ui'
import {
  Send, ChevronDown, ChevronUp, Sparkles,
  AlertCircle, Check,
} from 'lucide-react'

interface ComposeEmailDialogProps {
  open: boolean
  onClose: () => void
  /** Pre-fill the To field with this email */
  prefillTo?: string
  /** Pre-fill the subject */
  prefillSubject?: string
  /** Gmail thread id — when set, the send is a reply within that thread. */
  threadId?: string
  /** Contact name for templates */
  contactName?: string
  /** Contact ID to link the activity to */
  contactId?: string
  /** Company ID to link the activity to */
  companyId?: string
  /** Deal ID to link the activity to */
  dealId?: string
  /** Called after a successful send (e.g. to refresh the inbox). */
  onSent?: () => void
}

interface EmailTemplate {
  label: string
  subject: string
  body: string
}

const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    label: 'Follow-up',
    subject: 'Following up',
    body: `Hi {{name}},

I wanted to follow up on our recent conversation. Do you have any updates or questions I can help with?

Looking forward to hearing from you.

Best regards`,
  },
  {
    label: 'Introduction',
    subject: 'Nice to meet you',
    body: `Hi {{name}},

It was great connecting with you. I'd love to learn more about your needs and explore how we can work together.

Would you be available for a brief call this week?

Best regards`,
  },
  {
    label: 'Meeting Request',
    subject: 'Meeting request',
    body: `Hi {{name}},

I'd like to schedule a meeting to discuss how we can help you achieve your goals.

Would any of these times work for you?
-
-
-

Please let me know what works best.

Best regards`,
  },
  {
    label: 'Proposal',
    subject: 'Proposal for your review',
    body: `Hi {{name}},

Thank you for taking the time to discuss your needs. I've put together a proposal based on our conversation.

Please find the details below:



I'd be happy to walk you through the proposal at your convenience.

Best regards`,
  },
  {
    label: 'Thank You',
    subject: 'Thank you',
    body: `Hi {{name}},

Thank you for your time today. I really enjoyed our conversation and I'm excited about the opportunity to work together.

As a next step, I'll follow up with the details we discussed.

Best regards`,
  },
]

export function ComposeEmailDialog({
  open, onClose,
  prefillTo, prefillSubject, threadId, contactName,
  contactId, companyId, dealId, onSent,
}: ComposeEmailDialogProps) {
  const { addActivity, userId } = useCrm()
  const { send: sendGmail, isSending } = useGmailWrite()

  const [to, setTo] = useState(prefillTo ?? '')
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [subject, setSubject] = useState(prefillSubject ?? '')
  const [body, setBody] = useState('')
  const [showCcBcc, setShowCcBcc] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const templateRef = useRef<HTMLDivElement>(null)

  // Reset form when opening with new prefills
  useEffect(() => {
    if (open) {
      setTo(prefillTo ?? '')
      setSubject(prefillSubject ?? '')
      setBody('')
      setCc('')
      setBcc('')
      setShowCcBcc(false)
      setShowTemplates(false)
      setError(null)
      setSent(false)
    }
  }, [open, prefillTo, prefillSubject])

  // Close templates dropdown on outside click
  useEffect(() => {
    if (!showTemplates) return
    const handler = (e: MouseEvent) => {
      if (templateRef.current && !templateRef.current.contains(e.target as Node)) {
        setShowTemplates(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showTemplates])

  const applyTemplate = useCallback((template: EmailTemplate) => {
    const name = contactName || 'there'
    setSubject(template.subject)
    setBody(template.body.replace(/\{\{name\}\}/g, name))
    setShowTemplates(false)
  }, [contactName])

  const parseEmails = useCallback((input: string): string[] => {
    return input
      .split(/[,;\s]+/)
      .map(e => e.trim())
      .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
  }, [])

  const handleSend = useCallback(async () => {
    const toAddresses = parseEmails(to)
    if (toAddresses.length === 0) {
      setError('Please enter a valid email address.')
      return
    }
    if (!subject.trim() && !body.trim()) {
      setError('Please enter a subject or message body.')
      return
    }

    setError(null)

    const ccAddresses = cc ? parseEmails(cc) : []
    const bccAddresses = bcc ? parseEmails(bcc) : []

    const htmlBody = body.replace(/\n/g, '<br>')

    // Gmail send takes comma-separated header strings; the SDK re-validates
    // every address and caps the recipient count server-side.
    const result = await sendGmail({
      to: toAddresses.join(', '),
      cc: ccAddresses.length ? ccAddresses.join(', ') : undefined,
      bcc: bccAddresses.length ? bccAddresses.join(', ') : undefined,
      subject: subject || '(no subject)',
      content: body,
      html: htmlBody,
      threadId,
    })

    if (!result.success) {
      // User dismissed the consent popup — not an error worth shouting about.
      if (result.cancelled) return
      setError(result.error || 'Failed to send email.')
      return
    }

    // Auto-log as CRM activity
    await addActivity({
      type: 'email',
      title: `Email: ${subject || '(no subject)'}`,
      description: `Sent to ${toAddresses.join(', ')}${ccAddresses.length ? ` (cc: ${ccAddresses.join(', ')})` : ''}`,
      contactId: contactId || null,
      companyId: companyId || null,
      dealId: dealId || null,
      ownerId: userId ?? null,
    })

    setSent(true)
    onSent?.()
    setTimeout(() => {
      onClose()
    }, 1500)
  }, [to, cc, bcc, subject, body, threadId, sendGmail, addActivity, contactId, companyId, dealId, userId, onClose, onSent, parseEmails])

  // Sent success state
  if (sent) {
    return (
      <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
              <Check className="w-6 h-6 text-success" />
            </div>
            <p className="text-sm font-medium text-foreground">Email sent successfully</p>
            <p className="text-xs text-muted-foreground">Activity logged to CRM</p>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>{threadId ? 'Reply' : 'Compose Email'}</DialogTitle>
              <DialogDescription className="flex items-center gap-1.5 mt-0.5">
                Sending from
                <span className="inline-flex items-center rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-normal text-secondary-foreground">
                  your Gmail account
                </span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {/* To */}
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">To *</Label>
              <button
                onClick={() => setShowCcBcc(!showCcBcc)}
                className="text-[10px] text-primary hover:text-primary/80 transition-colors flex items-center gap-0.5"
              >
                Cc/Bcc
                {showCcBcc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
            <Input
              data-testid="email-to"
              value={to}
              onChange={e => { setTo(e.target.value); setError(null) }}
              placeholder="recipient@example.com"
              className="mt-1"
            />
          </div>

          {/* CC/BCC */}
          {showCcBcc && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Cc</Label>
                <Input
                  value={cc}
                  onChange={e => setCc(e.target.value)}
                  placeholder="cc@example.com"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Bcc</Label>
                <Input
                  value={bcc}
                  onChange={e => setBcc(e.target.value)}
                  placeholder="bcc@example.com"
                  className="mt-1"
                />
              </div>
            </div>
          )}

          {/* Subject */}
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Subject</Label>
              {/* Templates dropdown */}
              <div className="relative" ref={templateRef}>
                <button
                  onClick={() => setShowTemplates(!showTemplates)}
                  className="text-[10px] text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  Templates
                </button>
                {showTemplates && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-lg shadow-lg py-1 z-50">
                    {EMAIL_TEMPLATES.map(t => (
                      <button
                        key={t.label}
                        onClick={() => applyTemplate(t)}
                        className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-secondary/50 transition-colors"
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <Input
              data-testid="email-subject"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Email subject"
              className="mt-1"
            />
          </div>

          {/* Body */}
          <div>
            <Label className="text-xs">Message</Label>
            <Textarea
              data-testid="email-body"
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Write your message..."
              rows={8}
              className="mt-1 resize-none"
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  handleSend()
                }
              }}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <p className="text-[10px] text-muted-foreground">
              {navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl'}+Enter to send
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button
                data-testid="email-send"
                size="sm"
                onClick={handleSend}
                disabled={!to.trim() || (!subject.trim() && !body.trim()) || isSending}
                className="gap-1.5"
              >
                {isSending ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                Send
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
