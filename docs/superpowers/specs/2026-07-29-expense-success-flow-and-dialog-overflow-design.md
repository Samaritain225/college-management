# Expense Success Flow and Dialog Overflow Design

## Goal

Give users an explicit confirmation after creating an expense, make repeated entry quick, prevent the create dialog from moving horizontally, and improve the mobile page-header layout.

## Successful Creation Flow

- After `addExpense` succeeds, reset and close the create-expense dialog.
- Refresh expense and category data before presenting the success state so the list behind it is current.
- Open a compact success dialog with a clear confirmation icon, title, and short message.
- The success dialog has two actions:
  - `Ajouter une autre dépense` closes the success dialog and opens a fresh create-expense form.
  - `OK` closes the success dialog and leaves the refreshed expense list visible.
- The success dialog must not appear when creation or upload fails; existing inline error handling remains in the create dialog.
- Repeated expense creation follows the same success flow after every successful save.

## Create Dialog Overflow

- Keep vertical scrolling and the sticky mobile action footer.
- Explicitly hide horizontal overflow on the create-expense dialog.
- This prevents pointer, trackpad, or touch gestures from changing the dialog's horizontal scroll position.
- No form content may be clipped horizontally at 375px, 768px, or 1280px.

## Mobile Page Header

- Below 768px, the page header remains a vertical stack.
- The `Enregistrer une dépense` action appears beneath the expense title and description, aligned to the left.
- At 768px and above, the title block and action retain the current side-by-side layout with the action on the right.
- The category-tab action follows the same responsive header behavior for consistency.

## Components and State

- Add page-level state controlling the success dialog.
- Compose the existing shared `Dialog` and `Button` primitives; do not modify shared UI components.
- Reuse `handleOpenCreateExpenseDialog` for the repeated-entry action so all form state is reset consistently.
- The create and success dialogs are never open at the same time.

## Verification

- Create an expense and confirm the form closes, refreshed data is visible behind the success dialog, and both success actions work.
- Confirm a failed submission remains in the create dialog and does not open the success dialog.
- Confirm `Ajouter une autre dépense` opens a blank form, including an unselected category.
- Confirm `OK` only closes the success dialog.
- Confirm the create dialog has no horizontal scroll range or sideways pointer movement.
- Verify the page-header layout at 375px, 768px, and 1280px.
- Run the production build, lint, and diff checks.
