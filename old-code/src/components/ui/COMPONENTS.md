# Component Reference

Quick JSX examples for every UI component. Import from the barrel:

```tsx
import { Button, Input, Badge, Dialog, ... } from '../components/ui'
```

---

## cn() Utility

Merge Tailwind classes conditionally:

```tsx
import { cn } from '../components/ui'

<div className={cn('text-sm', isActive && 'font-bold', className)} />
```

---

## Button

```tsx
<Button>Default</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Cancel</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>

<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
<Button size="icon"><Search className="h-4 w-4" /></Button>

<Button loading>Saving...</Button>
<Button disabled>Disabled</Button>
```

---

## Input

```tsx
<Input placeholder="Enter text..." />
<Input type="email" placeholder="email@example.com" />
<Input disabled value="Read only" />
```

---

## Textarea

```tsx
<Textarea placeholder="Write something..." rows={4} />
```

---

## Select

```tsx
<Select value={value} onValueChange={setValue}>
  <SelectTrigger>
    <SelectValue placeholder="Pick one" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="a">Option A</SelectItem>
    <SelectItem value="b">Option B</SelectItem>
    <SelectItem value="c">Option C</SelectItem>
  </SelectContent>
</Select>
```

With groups:
```tsx
<Select>
  <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
  <SelectContent>
    <SelectGroup>
      <SelectLabel>Fruits</SelectLabel>
      <SelectItem value="apple">Apple</SelectItem>
      <SelectItem value="banana">Banana</SelectItem>
    </SelectGroup>
    <SelectSeparator />
    <SelectGroup>
      <SelectLabel>Vegetables</SelectLabel>
      <SelectItem value="carrot">Carrot</SelectItem>
    </SelectGroup>
  </SelectContent>
</Select>
```

---

## Checkbox

```tsx
<div className="flex items-center gap-2">
  <Checkbox id="terms" checked={checked} onCheckedChange={setChecked} />
  <Label htmlFor="terms">Accept terms</Label>
</div>
```

---

## Switch

```tsx
<div className="flex items-center gap-2">
  <Switch id="notifications" checked={enabled} onCheckedChange={setEnabled} />
  <Label htmlFor="notifications">Enable notifications</Label>
</div>
```

---

## Label

```tsx
<Label htmlFor="name">Name</Label>
<Input id="name" />
```

---

## Badge

```tsx
<Badge>Default (primary)</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="destructive">Error</Badge>
<Badge variant="success">Active</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="info">Info</Badge>
<Badge variant="outline">Outline</Badge>
```

---

## Avatar

```tsx
<Avatar>
  <AvatarImage src="/photo.jpg" alt="User" />
  <AvatarFallback>JD</AvatarFallback>
</Avatar>

{/* Custom size */}
<Avatar className="h-8 w-8">
  <AvatarImage src={user.imageUrl} />
  <AvatarFallback>{user.name?.[0]}</AvatarFallback>
</Avatar>
```

---

## Card

```tsx
<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card description text</CardDescription>
  </CardHeader>
  <CardContent>
    <p>Card body content here.</p>
  </CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
```

---

## Table

```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Status</TableHead>
      <TableHead className="text-right">Amount</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {items.map(item => (
      <TableRow key={item.id}>
        <TableCell className="font-medium">{item.name}</TableCell>
        <TableCell><Badge variant="success">Active</Badge></TableCell>
        <TableCell className="text-right">${item.amount}</TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

---

## Dialog

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogTrigger asChild>
    <Button>Open Dialog</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Edit Profile</DialogTitle>
      <DialogDescription>Make changes to your profile.</DialogDescription>
    </DialogHeader>
    <div className="space-y-4">
      <Input placeholder="Name" />
      <Textarea placeholder="Bio" />
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
      <Button onClick={handleSave}>Save</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## Modal (backward-compatible wrapper)

```tsx
<Modal open={showModal} onClose={() => setShowModal(false)} size="md">
  <Modal.Header>
    <Modal.Title>Create Item</Modal.Title>
    <Modal.Description>Fill in the details below.</Modal.Description>
  </Modal.Header>
  <Modal.Body>
    <Input placeholder="Title" />
  </Modal.Body>
  <Modal.Footer>
    <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
    <Button onClick={handleCreate}>Create</Button>
  </Modal.Footer>
</Modal>
```

---

## ConfirmModal

```tsx
<ConfirmModal
  open={showConfirm}
  onClose={() => setShowConfirm(false)}
  onConfirm={handleDelete}
  title="Delete item?"
  description="This action cannot be undone."
  confirmText="Delete"
  variant="destructive"
  loading={isDeleting}
/>
```

---

## DropdownMenu

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon">
      <MoreHorizontal className="h-4 w-4" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuLabel>Actions</DropdownMenuLabel>
    <DropdownMenuSeparator />
    <DropdownMenuItem onClick={handleEdit}>
      <Pencil className="mr-2 h-4 w-4" /> Edit
    </DropdownMenuItem>
    <DropdownMenuItem onClick={handleDelete} className="text-destructive">
      <Trash2 className="mr-2 h-4 w-4" /> Delete
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

---

## Tabs

```tsx
<Tabs defaultValue="overview">
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="settings">Settings</TabsTrigger>
    <TabsTrigger value="members">Members</TabsTrigger>
  </TabsList>
  <TabsContent value="overview">
    <p>Overview content here</p>
  </TabsContent>
  <TabsContent value="settings">
    <p>Settings content here</p>
  </TabsContent>
  <TabsContent value="members">
    <p>Members list here</p>
  </TabsContent>
</Tabs>
```

---

## Tooltip

```tsx
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="icon">
        <Info className="h-4 w-4" />
      </Button>
    </TooltipTrigger>
    <TooltipContent>
      <p>Helpful information here</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

---

## Alert

```tsx
<Alert>
  <AlertTitle>Heads up!</AlertTitle>
  <AlertDescription>This is a default alert.</AlertDescription>
</Alert>

<Alert variant="destructive">
  <AlertTitle>Error</AlertTitle>
  <AlertDescription>Something went wrong.</AlertDescription>
</Alert>

<Alert variant="success">
  <AlertTitle>Success</AlertTitle>
  <AlertDescription>Operation completed.</AlertDescription>
</Alert>
```

---

## Progress

```tsx
<Progress value={66} />
<Progress value={100} className="h-3" />
```

---

## Separator

```tsx
<Separator />                          {/* horizontal */}
<Separator orientation="vertical" />   {/* vertical */}
```

---

## SearchInput

```tsx
<SearchInput
  placeholder="Search items..."
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  onClear={() => setSearch('')}
/>
```

---

## CardGrid + GridCard

```tsx
<CardGrid columns={3}>
  {items.map(item => (
    <GridCard key={item.id} onClick={() => selectItem(item.id)}>
      <GridCard.Image src={item.imageUrl} />
      <GridCard.Header actions={<GridCard.Actions onDelete={() => remove(item.id)} />}>
        <GridCard.Title>{item.data.title}</GridCard.Title>
      </GridCard.Header>
      <GridCard.Content>
        <GridCard.Description>{item.data.description}</GridCard.Description>
      </GridCard.Content>
      <GridCard.Footer>
        <GridCard.Badge variant="success">Active</GridCard.Badge>
      </GridCard.Footer>
    </GridCard>
  ))}
</CardGrid>
```

---

## EmptyState

```tsx
<EmptyItems action={{ label: 'Create item', onClick: () => setShowCreate(true) }} />
<EmptySearch query={searchQuery} onClear={() => setSearchQuery('')} />
<EmptyError error="Failed to load data" onRetry={() => refetch()} />
```

---

## Skeleton / Loading

```tsx
<Skeleton className="h-4 w-[200px]" />
<SkeletonText lines={3} />
<SkeletonCard hasImage />
<SkeletonList items={5} />
<SkeletonTable rows={5} columns={4} />

<LoadingSpinner size="lg" />
<LoadingOverlay message="Loading data..." />
```

---

## Toast

```tsx
const { success, error, warning, info } = useToast()

success('Item created successfully')
error('Failed to save')
warning('Unsaved changes')
info('New update available')
```

---

## Color Token Reference

| Class | Use |
|-------|-----|
| `bg-background` | Page background |
| `text-foreground` | Primary text |
| `bg-card` | Card/elevated surfaces |
| `bg-muted` / `text-muted-foreground` | Subtle bg / secondary text |
| `bg-primary` / `text-primary` | Primary accent |
| `text-primary-foreground` | Text on primary bg |
| `bg-destructive` / `text-destructive` | Danger/error |
| `bg-success` / `text-success` | Success |
| `bg-warning` / `text-warning` | Warning |
| `bg-info` / `text-info` | Info |
| `border-border` | Standard borders |
| `ring-ring` | Focus rings |
