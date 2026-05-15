import { useState } from 'react'
import { useCrm } from '../platform/CrmPlatformProvider'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Button, Input, Label,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from './ui'
import type { PersonType } from '../platform/types'

interface Props {
  open: boolean
  onClose: () => void
}

export function AddContactDialog({ open, onClose }: Props) {
  const { addPerson, companies } = useCrm()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [title, setTitle] = useState('')
  const [department, setDepartment] = useState('')
  const [type, setType] = useState<PersonType>('contact')
  const [companyId, setCompanyId] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      await addPerson({
        name: name.trim(),
        email: email.trim() || null,
        title: title.trim() || null,
        department: department.trim() || null,
        type,
        companyId: companyId || null,
        status: 'active',
      })
      setName(''); setEmail(''); setTitle(''); setDepartment(''); setType('contact'); setCompanyId('')
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Contact</DialogTitle>
          <DialogDescription>Add a new person to your CRM.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <Label>Name *</Label>
            <Input data-testid="contact-name-input" value={name} onChange={e => setName(e.target.value)} placeholder="John Smith" required autoFocus maxLength={200} />
          </div>
          <div>
            <Label>Email</Label>
            <Input data-testid="contact-email-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="john@example.com" type="email" maxLength={320} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Job Title</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="VP of Sales" maxLength={200} />
            </div>
            <div>
              <Label>Department</Label>
              <Input value={department} onChange={e => setDepartment(e.target.value)} placeholder="Sales" maxLength={200} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={v => setType(v as PersonType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contact">Contact</SelectItem>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="vendor">Vendor</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={saving}>Add Contact</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
