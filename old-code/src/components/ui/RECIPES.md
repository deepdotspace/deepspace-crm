# Composition Recipes

Common patterns combining multiple components.

---

## Form with Validation

```tsx
import { useState } from 'react'
import { Button, Input, Textarea, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui'

function CreateItemForm({ onSubmit, onCancel }: { onSubmit: (data: any) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!title.trim()) errs.title = 'Title is required'
    if (!category) errs.category = 'Category is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (validate()) {
      onSubmit({ title, description, category })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Title *</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter title"
          className={errors.title ? 'border-destructive' : ''}
        />
        {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label>Category *</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className={errors.category ? 'border-destructive' : ''}>
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="general">General</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="archive">Archive</SelectItem>
          </SelectContent>
        </Select>
        {errors.category && <p className="text-xs text-destructive">{errors.category}</p>}
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit">Create</Button>
      </div>
    </form>
  )
}
```

---

## Dialog with Form

```tsx
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Button, Input, Label } from '../components/ui'

function EditDialog({ open, onOpenChange, item, onSave }) {
  const [name, setName] = useState(item?.data.name ?? '')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Item</DialogTitle>
          <DialogDescription>Update the item details below.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { onSave(name); onOpenChange(false) }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

---

## Tabbed Page Layout

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui'

function DashboardPage() {
  return (
    <div className="h-full bg-background overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground mb-6">Dashboard</h1>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Overview cards, stats, etc. */}
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            {/* Charts, graphs, etc. */}
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            {/* Settings form */}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
```

---

## Data Table with Search

```tsx
import { useState, useMemo } from 'react'
import { useQuery } from '@spaces/sdk/storage'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Badge, SearchInput, EmptySearch, SkeletonTable } from '../components/ui'

function ItemsTable() {
  const { records, isLoading } = useQuery('items')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search) return records
    const q = search.toLowerCase()
    return records.filter(r => r.data.title?.toLowerCase().includes(q))
  }, [records, search])

  if (isLoading) return <SkeletonTable rows={5} columns={4} />

  return (
    <div className="space-y-4">
      <SearchInput
        placeholder="Search items..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onClear={() => setSearch('')}
      />

      {filtered.length === 0 ? (
        <EmptySearch query={search} onClear={() => setSearch('')} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(item => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.data.title}</TableCell>
                <TableCell>
                  <Badge variant={item.data.status === 'active' ? 'success' : 'secondary'}>
                    {item.data.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(item.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm">Edit</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
```

---

## Search + Filter Bar

```tsx
import { SearchInput, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Button } from '../components/ui'

function FilterBar({ search, setSearch, filter, setFilter, onCreate }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <SearchInput
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onClear={() => setSearch('')}
        />
      </div>
      <Select value={filter} onValueChange={setFilter}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Filter" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="archived">Archived</SelectItem>
        </SelectContent>
      </Select>
      <Button onClick={onCreate}>Create</Button>
    </div>
  )
}
```

---

## DropdownMenu for Row Actions

```tsx
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, Button } from '../components/ui'
import { MoreHorizontal, Pencil, Copy, Trash2 } from 'lucide-react'

function RowActions({ onEdit, onDuplicate, onDelete }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="mr-2 h-4 w-4" /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDuplicate}>
          <Copy className="mr-2 h-4 w-4" /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="text-destructive">
          <Trash2 className="mr-2 h-4 w-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

---

## Settings Form with Switch and Checkbox

```tsx
import { Card, CardHeader, CardTitle, CardContent, Switch, Checkbox, Label, Separator } from '../components/ui'

function SettingsForm({ settings, onToggle }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Label>Email notifications</Label>
            <p className="text-sm text-muted-foreground">Receive email for important updates</p>
          </div>
          <Switch
            checked={settings.emailNotifications}
            onCheckedChange={(v) => onToggle('emailNotifications', v)}
          />
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <div>
            <Label>Dark mode</Label>
            <p className="text-sm text-muted-foreground">Use dark color scheme</p>
          </div>
          <Switch
            checked={settings.darkMode}
            onCheckedChange={(v) => onToggle('darkMode', v)}
          />
        </div>
        <Separator />
        <div className="flex items-center gap-2">
          <Checkbox
            id="terms"
            checked={settings.acceptedTerms}
            onCheckedChange={(v) => onToggle('acceptedTerms', v)}
          />
          <Label htmlFor="terms">I accept the terms and conditions</Label>
        </div>
      </CardContent>
    </Card>
  )
}
```
