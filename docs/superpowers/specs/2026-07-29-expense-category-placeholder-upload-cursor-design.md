# Expense Category Placeholder and Upload Cursor Design

## Goal

Make the create-expense form require an explicit category choice and make the receipt upload control clearly interactive with a mouse.

## Behavior

- The category field starts with no selected value whenever the create-expense dialog opens.
- Loading or refreshing the category list must not automatically select the first category.
- The closed category trigger displays `Choisir une catégorie…` until the user selects an existing category or the create-category option.
- Existing required-field validation remains responsible for rejecting submission without a category.
- Selecting a category continues to clear the category validation error.
- The visible receipt upload button uses a pointer cursor when it is enabled. Its existing disabled behavior remains unchanged.

## Implementation

- Keep the existing empty-string representation for an unselected category.
- Remove the first-category assignment from `loadCategories`.
- Reset `categoryId` to an empty string in `resetExpenseForm`.
- Keep the current controlled `Select`, placeholder, option rendering, and validation flow.
- Add the pointer cursor utility to the composed receipt upload `Button`; no shared UI primitive changes are required.

## Verification

- Open the create-expense dialog after categories have loaded and confirm the placeholder is shown.
- Close and reopen the dialog after selecting a category and confirm the placeholder returns.
- Submit without choosing a category and confirm the existing category error appears.
- Select a category and confirm its name replaces the placeholder.
- On desktop, hover the receipt upload button and confirm the cursor becomes a pointer.
- Run the production build, lint, and diff checks.
