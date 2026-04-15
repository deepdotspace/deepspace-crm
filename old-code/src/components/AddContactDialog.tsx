import { useState } from 'react'
import { useCrm } from '../platform/CrmPlatformProvider'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Button, Input, Label,
} from './ui'
import type { PersonType } from '../platform/types'

interface Props {
  open: boolean
  onClose: () => void
}

const selectClass = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring'

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
            <Input data-testid="contact-name-input" value={name} onChange={e => setName(e.target.value)} placeholder="John Smith" required autoFocus />
          </div>
          <div>
            <Label>Email</Label>
            <Input data-testid="contact-email-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="john@example.com" type="email" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Job Title</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="VP of Sales" />
            </div>
            <div>
              <Label>Department</Label>
              <Input value={department} onChange={e => setDepartment(e.target.value)} placeholder="Sales" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <select className={selectClass} value={type} onChange={e => setType(e.target.value as PersonType)}>
                <option value="contact">Contact</option>
                <option value="customer">Customer</option>
                <option value="employee">Employee</option>
                <option value="vendor">Vendor</option>
              </select>
            </div>
            <div>
              <Label>Company</Label>
              <select className={selectClass} value={companyId} onChange={e => setCompanyId(e.target.value)}>
                <option value="">None</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
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
