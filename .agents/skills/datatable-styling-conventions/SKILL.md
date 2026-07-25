---
name: datatable-styling-conventions
description: Standard datatable styling guidelines and conventions for all data tables across the app.
---

# Datatable Styling Conventions

Use this skill whenever creating, refactoring, or editing data tables (`<Table>`, `<TableHeader>`, `<TableBody>`, `<TableRow>`, `<TableHead>`, `<TableCell>`) in this codebase.

## Mandatory Rules for Data Tables

### 1. Outer Container & Responsive Wrapper
All data tables MUST be wrapped in a rounded, bordered card container with an inner horizontal overflow scroll region to prevent mobile viewport clipping:

```tsx
<div className="rounded-md border border-ink/10 bg-paper overflow-hidden">
  <div className="overflow-x-auto">
    <Table>
      ...
    </Table>
  </div>
</div>
```

### 2. Table Header (`TableHeader`)
Headers MUST use `text-xs font-display font-semibold text-ink-soft` with explicit bottom border:

```tsx
<TableHeader>
  <TableRow className="border-b border-ink/10">
    <TableHead className="text-xs font-display font-semibold text-ink-soft">Nom</TableHead>
    <TableHead className="text-xs font-display font-semibold text-ink-soft hidden sm:table-cell">Matière</TableHead>
    <TableHead className="text-xs font-display font-semibold text-ink-soft text-right">Montant</TableHead>
    <TableHead className="text-xs font-display font-semibold text-ink-soft text-right">Actions</TableHead>
  </TableRow>
</TableHeader>
```

### 3. Table Rows (`TableBody` > `TableRow`)
All data rows MUST feature explicit row borders, removal of border on last row, and the standard brand hover state (`hover:bg-teal-100/30`):

```tsx
<TableRow key={item.id} className="border-b border-ink/10 last:border-0 hover:bg-teal-100/30 transition-colors">
```

### 4. Table Cells (`TableCell`)
- All text in data cells MUST be `text-xs` (never `text-sm` or `text-lg`).
- **Primary Title / Name**: `text-xs font-display font-semibold text-ink`
- **Secondary Subtext / Subtitle**: `text-xs text-ink-soft`
- **Monetary Amounts**: `text-xs font-display font-bold text-ink` formatted using `formatMoney(amount)`
- **Badges**: Use `<Badge variant="positive">` / `<Badge variant="negative">` / `<Badge variant="neutral">` with `text-xs`
- **Action Buttons**: Icon buttons MUST be `h-8 w-8 text-ink-soft hover:text-teal-950 hover:bg-teal-100/50`

### 5. Progressive Responsive Column Hiding
On mobile viewports, keep only primary identifier and essential metrics visible. Hide non-critical columns using Tailwind breakpoints:
- `hidden sm:table-cell`: Secondary details (phone numbers, secondary categories, dates)
- `hidden md:table-cell`: Tertiary metadata (creator names, ownership %, linked accounts)
