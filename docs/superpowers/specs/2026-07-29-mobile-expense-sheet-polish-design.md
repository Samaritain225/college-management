# Mobile Expense Sheet Polish Design

## Goal

Make the existing create-expense dialog feel intentionally designed for touch
devices while preserving its current fields, validation, submission flow, and
desktop layout.

## Chosen Approach

Polish the existing responsive dialog rather than replacing it with a new
bottom-sheet component. This keeps the change focused, preserves the tested
form behavior, and avoids maintaining two versions of the expense form.

## Mobile Behavior

Below the `md` breakpoint (`768px`):

- Text inputs, selects, the date control, attachment control, and footer
  actions have a minimum `44px` touch target.
- The close action has a `44px` target with a small close icon and a French
  accessible label.
- The submit and cancel actions remain visible in a sticky footer inside the
  dialog's scroll container.
- The dialog contains scroll momentum so the page behind it does not scroll.
- The form remains one column with the current spacing and field order.

At `768px` and wider, retain the existing compact control heights and normal
non-sticky footer.

## Category Selection

Existing category options keep their name and optional description while the
menu is open. The closed trigger shows only the selected category name. The
new-category option and creation fields remain unchanged.

This behavior incorporates the approved
`2026-07-29-expense-category-selected-value-design.md` specification.

## Attachment Control

Replace the crowded native visible file input with a composed attachment row:

- a `44px` outlined label control with an attachment icon;
- “Ajouter un justificatif” when empty;
- the selected filename when a file is present;
- a visually hidden native file input retaining the existing accepted formats
  and validation behavior.

The supporting copy becomes:

> JPG, PNG, WebP ou PDF. PDF : 10 Mo maximum.

Do not tell users that images are compressed.

## Error and Submission States

- Existing inline field and general upload errors remain unchanged.
- The sticky footer must not cover errors or the attachment helper text.
- During submission, both actions remain disabled and the primary action reads
  “Enregistrement…”.
- The dialog must remain closable through its close action and cancel action
  when not submitting.

## Verification

- At `375 × 667` and `375 × 812`, the dialog stays within `90svh`, scrolls
  internally, and has no horizontal overflow.
- All mobile actions and form controls have at least a `44 × 44px` target.
- The footer remains visible while the form content scrolls.
- The selected category trigger contains only the category name; open options
  still show descriptions.
- The attachment control opens the file chooser and shows the selected
  filename without changing validation.
- At `768px` and `1280px`, the existing compact desktop layout remains intact.
- TypeScript, lint, and the production build pass.
