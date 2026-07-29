# Expense Category Selected Value Design

## Goal

Keep the create-expense sheet compact and easy to scan after a category has
been selected, especially on mobile.

## Behavior

- While the category menu is open, each existing category continues to show
  its name and optional description.
- After selection, the closed trigger shows only the category name.
- The “Créer une nouvelle catégorie” flow and its optional description field
  remain unchanged.
- Validation, stored values, and category creation behavior remain unchanged.

## Implementation

Give each existing category option an explicit name-only text value for the
select trigger while preserving its richer name-and-description content in the
open menu. Keep this change local to the create-expense category options in
`src/features/expenses/ExpensesPage.tsx`.

## Verification

- Open category options still display descriptions when available.
- Selecting an existing category leaves only its name in the trigger.
- Selecting the new-category option still reveals the category creation fields.
- The trigger stays on one line without horizontal overflow at `375px`.
- TypeScript, lint, and the production build pass.
