import { useState } from 'react'
import { useCrm } from '../platform/CrmPlatformProvider'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Button, Input, Label, DatePicker,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from './ui'

interface Props {
  open: boolean
  onClose: () => void
}

export function AddDealDialog({ open, onClose }: Props) {
  const { addDeal, companies, stages } = useCrm()
  const [title, setTitle] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [stageId, setStageId] = useState('')
  const [amount, setAmount] = useState('')
  const [closeDate, setCloseDate] = useState('')
  const [source, setSource] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || saving) return
    setSaving(true)
    try {
      const selectedStage = stages.find(s => s.id === stageId)
      await addDeal({
        title: title.trim(),
        companyId: companyId || null,
        stageId: stageId || (stages[0]?.id ?? null),
        amount: parseFloat(amount) || 0,
        closeDate: closeDate || null,
        probability: selectedStage?.defaultProbability ?? 10,
        source: (source || null) as 'inbound' | 'outbound' | 'referral' | 'partner' | 'other' | null,
        status: 'open',
        currency: 'USD',
      })
      setTitle(''); setCompanyId(''); setStageId(''); setAmount(''); setCloseDate(''); setSource('')
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Deal</DialogTitle>
          <DialogDescription>Create a new deal in your pipeline.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <Label>Deal Title *</Label>
            <Input data-testid="deal-title-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Enterprise License" required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Company</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Stage</Label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount ($)</Label>
              <Input value={amount} onChange={e => setAmount(e.target.value)} placeholder="50000" type="number" />
            </div>
            <div>
              <Label>Close Date</Label>
              <DatePicker value={closeDate} onChange={v => setCloseDate(v)} placeholder="Pick close date" />
            </div>
          </div>
          <div>
            <Label>Source</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="inbound">Inbound</SelectItem>
                <SelectItem value="outbound">Outbound</SelectItem>
                <SelectItem value="referral">Referral</SelectItem>
                <SelectItem value="partner">Partner</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={saving}>Add Deal</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
