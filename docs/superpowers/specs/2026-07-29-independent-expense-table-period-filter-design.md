# Independent Expense Table Period Filter Design

## Goal

Separate KPI period analysis from expense-list browsing so each filter answers one question, refetches only its own data, and avoids an unbounded table query by default.

## Filter Ownership

- The existing KPI period filter controls only the KPI cards and their comparison data.
- The expense data table gets a separate period filter beside its search and category controls.
- Changing the KPI period must not refetch or change the table.
- Changing the table period must not refetch or change the KPI cards.
- Search, category, sorting, pagination, and filtered totals remain table-owned.
- The category-details history may continue using the KPI period because it is part of the category analysis flow, not the expense table.
- The print dialog keeps its own independent report period.

## Table Period Options

The table period filter contains:

1. `Ce mois-ci`
2. `Cette année`
3. One option for every historical year present in expense data, ordered newest first
4. `Toutes les années`

`Cette année` is the default. The current year is excluded from the numeric historical-year options to avoid duplicate choices.

The filter uses inclusive local-calendar bounds:

- `Ce mois-ci`: first through last day of the current month
- `Cette année`: January 1 through December 31 of the current year
- Numeric year: January 1 through December 31 of that year
- `Toutes les années`: no date bounds

Changing the table period resets pagination to page 1.

## Data Loading

- Split the current combined loader into independently triggered table and KPI loaders.
- The table loader requests one server-paged result using table period, debounced search, category, sort, direction, and page.
- The KPI loader requests summary data using only the KPI period.
- Refresh after expense/category writes invokes both loaders plus category refresh.
- Loading state remains scoped so a KPI change does not visually reload the table and a table change does not reload KPI cards.

## Available Years

Add a small Postgres function that returns distinct expense years for the current college, ordered descending.

- The function returns integers only, not expense rows.
- It filters by the supplied college identifier.
- It uses `SECURITY INVOKER`, preserving caller permissions and underlying RLS behavior.
- Grant execution explicitly to `authenticated`; do not rely on automatic Data API exposure.
- The client loads the years once with the expense page and refreshes them after a successful expense write, so a newly introduced year becomes selectable.
- If the year-list request fails, the table remains usable with `Ce mois-ci`, `Cette année`, and `Toutes les années`.

## UI and Responsive Behavior

- Keep the KPI period control in its existing position above the KPI cards.
- Add the table period Select to the existing table filter row with search, category, and print actions.
- Use existing Select and form-control styling.
- On narrow screens, controls wrap without clipping or horizontal page overflow.
- The period labels are explicit enough that users can distinguish KPI analysis from table browsing without additional explanatory text.

## Empty, Error, and Loading States

- A valid table period with no matching expenses shows the existing filtered empty state.
- Table-period changes use the existing table loading treatment.
- KPI-period changes update the cards without activating the table loading treatment.
- Failure to fetch available years is non-blocking and must not fall back to downloading all expense dates.

## Verification

- Confirm the initial table query is bounded to the current year and returns one page only.
- Change the KPI period and confirm table rows, total, page, and table loading state do not change.
- Change the table period and confirm KPI values and KPI loading state do not change.
- Verify month, current-year, historical-year, and all-years bounds.
- Confirm years are distinct, descending, college-scoped, and exclude the current year in the UI.
- Confirm table-period, category, search, and sorting changes reset pagination appropriately.
- Verify responsive filter layout at 375px, 768px, and 1280px.
- Run database-function verification, production build, lint, and diff checks.
