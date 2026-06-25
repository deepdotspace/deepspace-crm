/**
 * ImportGoogleContactsDialog — import the user's Google Contacts into the CRM.
 *
 * Reads Google Contacts via the People API (contacts.readonly) through
 * `useGoogleContacts`, dedupes against existing CRM people by email, lets the
 * user pick which to import, and creates local `people` records. The first
 * import transparently prompts for the contacts.readonly grant.
 *
 * One-directional: nothing is written back to Google.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useCrm } from '../platform/CrmPlatformProvider'
import { useGoogleContacts, type GoogleContact } from '../platform/useGoogleContacts'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Button, Input, Checkbox, Badge,
} from './ui'
import { Search, Users, AlertCircle, Check, Download, RefreshCw } from 'lucide-react'

interface ImportGoogleContactsDialogProps {
  open: boolean
  onClose: () => void
  onImported?: (count: number) => void
}

type LoadState = 'loading' | 'loaded' | 'error' | 'cancelled'

export function ImportGoogleContactsDialog({ open, onClose, onImported }: ImportGoogleContactsDialogProps) {
  const { people, companies, addPerson } = useCrm()
  const { fetchContacts } = useGoogleContacts()

  const [state, setState] = useState<LoadState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [contacts, setContacts] = useState<GoogleContact[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState(false)
  const [importedCount, setImportedCount] = useState<number | null>(null)

  // Existing CRM emails (lowercased) for dedupe.
  const existingEmails = useMemo(
    () => new Set(people.map((p) => p.email?.toLowerCase()).filter(Boolean) as string[]),
    [people],
  )

  // Company name (lowercased) → id, to link imported contacts to known companies.
  const companyByName = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of companies) m.set(c.name.toLowerCase(), c.id)
    return m
  }, [companies])

  const isExisting = useCallback(
    (c: GoogleContact) => !!c.email && existingEmails.has(c.email.toLowerCase()),
    [existingEmails],
  )

  const load = useCallback(async () => {
    setState('loading')
    setError(null)
    const res = await fetchContacts()
    if (res.cancelled) {
      setState('cancelled')
      return
    }
    if (res.error) {
      setError(res.error)
      setState('error')
      return
    }
    setContacts(res.contacts)
    // Pre-select everything not already in the CRM.
    setSelected(new Set(res.contacts.filter((c) => !isExisting(c)).map((c) => c.resourceName)))
    setState('loaded')
  }, [fetchContacts, isExisting])

  // Fetch when the dialog opens; reset on close.
  useEffect(() => {
    if (open) {
      setImportedCount(null)
      setSearch('')
      load()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return contacts
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email?.toLowerCase().includes(q) ?? false) ||
        (c.company?.toLowerCase().includes(q) ?? false),
    )
  }, [contacts, search])

  const selectableFiltered = filtered.filter((c) => !isExisting(c))
  const allSelected = selectableFiltered.length > 0 && selectableFiltered.every((c) => selected.has(c.resourceName))

  const toggle = useCallback((resourceName: string) => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(resourceName)) next.delete(resourceName)
      else next.add(resourceName)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelected((s) => {
      const next = new Set(s)
      if (allSelected) {
        selectableFiltered.forEach((c) => next.delete(c.resourceName))
      } else {
        selectableFiltered.forEach((c) => next.add(c.resourceName))
      }
      return next
    })
  }, [allSelected, selectableFiltered])

  const handleImport = useCallback(async () => {
    const toImport = contacts.filter((c) => selected.has(c.resourceName) && !isExisting(c))
    if (toImport.length === 0) return
    setImporting(true)
    let count = 0
    for (const c of toImport) {
      const companyId = c.company ? companyByName.get(c.company.toLowerCase()) ?? null : null
      const metadata: Record<string, unknown> = { source: 'google', googleResourceName: c.resourceName }
      if (c.phone) metadata.phone = c.phone
      if (c.company) metadata.company = c.company
      if (c.notes) metadata.notes = c.notes
      await addPerson({
        name: c.name || c.email || 'Unnamed contact',
        email: c.email,
        title: c.title,
        department: c.department,
        type: 'contact',
        status: 'active',
        companyId,
        metadata,
      })
      count++
    }
    setImporting(false)
    setImportedCount(count)
    onImported?.(count)
    setTimeout(() => onClose(), 1500)
  }, [contacts, selected, isExisting, companyByName, addPerson, onImported, onClose])

  const selectedCount = useMemo(
    () => contacts.filter((c) => selected.has(c.resourceName) && !isExisting(c)).length,
    [contacts, selected, isExisting],
  )

  // ── Success state ─────────────────────────────────────────────────────────
  if (importedCount !== null) {
    return (
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
              <Check className="w-6 h-6 text-success" />
            </div>
            <p className="text-sm font-medium text-foreground">
              Imported {importedCount} {importedCount === 1 ? 'contact' : 'contacts'}
            </p>
            <p className="text-xs text-muted-foreground">From your Google Contacts</p>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-lg flex flex-col max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Import from Google Contacts</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 mt-0.5">
            Read-only import from
            <span className="inline-flex items-center rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-normal text-secondary-foreground">
              your Google Contacts
            </span>
          </DialogDescription>
        </DialogHeader>

        {state === 'loading' && (
          <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
            <div className="w-5 h-5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
            Loading your Google Contacts…
          </div>
        )}

        {state === 'cancelled' && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-foreground">Google access wasn't granted.</p>
            <p className="text-xs text-muted-foreground">
              We need read-only access to your contacts to import them.
            </p>
            <Button size="sm" variant="outline" onClick={load} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Try again
            </Button>
          </div>
        )}

        {state === 'error' && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {error || 'Failed to load contacts.'}
            </div>
            <Button size="sm" variant="outline" onClick={load} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Retry
            </Button>
          </div>
        )}

        {state === 'loaded' && (
          <>
            {contacts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
                <Users className="w-5 h-5" />
                No contacts found in your Google account.
              </div>
            ) : (
              <>
                {/* Search + select-all */}
                <div className="flex items-center gap-2 mt-1">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search name, email, company"
                      className="pl-8 h-8"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={toggleAll}
                    disabled={selectableFiltered.length === 0}
                    className="text-xs text-primary hover:text-primary/80 disabled:opacity-40 whitespace-nowrap"
                  >
                    {allSelected ? 'Clear' : 'Select all'}
                  </button>
                </div>

                {/* List */}
                <div className="mt-2 flex-1 overflow-y-auto rounded-lg border border-border divide-y divide-border/50">
                  {filtered.map((c) => {
                    const existing = isExisting(c)
                    const checked = selected.has(c.resourceName)
                    return (
                      <label
                        key={c.resourceName}
                        className={`flex items-center gap-3 px-3 py-2 ${existing ? 'opacity-50' : 'cursor-pointer hover:bg-secondary/10'}`}
                      >
                        <Checkbox
                          checked={!existing && checked}
                          disabled={existing}
                          onCheckedChange={() => toggle(c.resourceName)}
                        />
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-[10px] font-medium text-primary">
                          {(c.name || c.email || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground truncate">
                              {c.name || c.email}
                            </span>
                            {existing && <Badge variant="secondary" className="text-[10px]">In CRM</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {[c.email, c.company].filter(Boolean).join(' · ') || 'No email'}
                          </div>
                        </div>
                      </label>
                    )
                  })}
                  {filtered.length === 0 && (
                    <div className="px-3 py-6 text-center text-xs text-muted-foreground">No matches.</div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-3">
                  <span className="text-xs text-muted-foreground">
                    {selectedCount} selected · {contacts.filter(isExisting).length} already in CRM
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
                    <Button
                      size="sm"
                      onClick={handleImport}
                      disabled={selectedCount === 0 || importing}
                      className="gap-1.5"
                    >
                      {importing ? (
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      Import {selectedCount > 0 ? selectedCount : ''}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
