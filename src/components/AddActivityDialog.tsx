import { useState } from 'react'
import { useCrm } from '../platform/CrmPlatformProvider'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Button, Input, Label, Textarea, DateTimePicker,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from './ui'
import type { ActivityType } from '../platform/types'

interface Props {
  open: boolean
  onClose: () => void
  prefillContactId?: string
  prefillDealId?: string
  prefillCompanyId?: string
}

export function AddActivityDialog({ open, onClose, prefillContactId, prefillDealId, prefillCompanyId }: Props) {
  const { addActivity, people, companies, deals, userId } = useCrm()
  const [type, setType] = useState<ActivityType>('note')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [contactId, setContactId] = useState(prefillContactId ?? '')
  const [companyId, setCompanyId] = useState(prefillCompanyId ?? '')
  const [dealId, setDealId] = useState(prefillDealId ?? '')
  const [dueAt, setDueAt] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || saving) return
    setSaving(true)
    try {
      await addActivity({
        type,
        title: title.trim(),
        description: description.trim() || null,
        contactId: contactId || null,
        companyId: companyId || null,
        dealId: dealId || null,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        ownerId: userId ?? null,
      })
      setType('note'); setTitle(''); setDescription(''); setContactId(prefillContactId ?? '')
      setCompanyId(prefillCompanyId ?? ''); setDealId(prefillDealId ?? ''); setDueAt('')
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log Activity</DialogTitle>
          <DialogDescription>Record an interaction or create a task.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Activity type pills */}
          <div>
            <Label>Type</Label>
            <div className="flex gap-1.5 mt-1">
              {(['note', 'email', 'call', 'meeting', 'task'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors capitalize ${
                    type === t
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Title *</Label>
            <Input data-testid="activity-title-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Follow-up call" required autoFocus />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Details..." rows={3} />
          </div>
          {type === 'task' && (
            <div>
              <Label>Due Date</Label>
              <DateTimePicker value={dueAt} onChange={v => setDueAt(v)} placeholder="Pick due date & time" />
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Contact</Label>
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger className="text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {people.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Company</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger className="text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Deal</Label>
              <Select value={dealId} onValueChange={setDealId}>
                <SelectTrigger className="text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {deals.map(d => <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={saving}>Log Activity</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
