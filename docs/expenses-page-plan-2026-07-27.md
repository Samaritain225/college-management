# Expenses page — implementation plan, 27 July 2026

Turns every finding in `expenses-ux-benchmark-2026-07-27.md` into work.
Scope is deliberately narrow: **`/expenses` and `/expense-categories` only.**
The dashboard, the investors page and the schema's empty supplier columns are
out of scope even where they are adjacent.

Six phases. Phase 1 is one migration and unblocks four of the other five.
Phase 2 stands alone and could ship on its own this afternoon.

---

## Phase 1 — One migration: `expenses_page` v2, plus `expenses_export`

`create or replace` on the existing function, in a single new migration file.
Nothing about the current contract is removed, so an old client keeps working
while the new one deploys.

**Verified prerequisites.** `expense_payments` has a SELECT policy for
`authenticated` and the base-table SELECT grant, so `security invoker` reads it
without a new grant. `expense_standings` is readable too, but the function joins
`expense_payments` directly rather than the view — the view groups per expense
with no `college_id` predicate pushed in, and we already have the college filter
in hand.

### 1a. New payment columns on each row

Add to the `filtered` CTE a left join onto a per-expense payment sum, and emit
two new keys in `rows`:

- `paid` — sum of `expense_payments.amount` for that expense, 0 if none.
- `reliquat` — `greatest(total_amount - paid, 0)`, mirroring
  `expense_standings` exactly so the two can never disagree.

Also emit `receipt_key`, which the row already carries and the client has never
been sent. This is what Phase 2 needs to stop lying about the receipt.

### 1b. New aggregates in `stats` (period scope, unchanged meaning)

| Key | Meaning |
|---|---|
| `paid_amount` | sum of payments against expenses in the period |
| `reliquat_amount` | `total_amount − paid_amount`, floored at 0 per expense |
| `unpaid_count` | expenses in the period with `reliquat > 0` |
| `prev_amount` | the comparison window's total (below) |
| `prev_days` / `elapsed_days` | so the client can label the comparison honestly |
| `max_amount`, `max_label`, `max_category`, `max_on` | the single largest expense of the period |

`total_count`, `total_amount`, `avg_amount`, `today_count`, `today_amount` all
stay. Phase 3 stops rendering two of them; leaving them in the payload costs
nothing and keeps this migration reversible from the UI side alone.

**The comparison window, precisely.** Given `p_from`/`p_to`:

```
elapsed_days = least(p_to, current_date) - p_from + 1
prev_from    = p_from - (p_to - p_from + 1)
prev_to      = prev_from + elapsed_days - 1
```

So July-to-date (27 days) is compared against **1–27 June**, not all of June.
This is the whole point: 3,125,500 against a full June of 7,321,500 reads as a
57% collapse, and it is an artefact of the calendar. When `p_from` is null
("Toutes les périodes") every comparison key comes back null and Phase 3 hides
the comparison line rather than inventing one.

### 1c. `filtered_total`

A sum over the `filtered` CTE — every filter applied, including search and
category. This is the number that makes "money follows the filter" true, and it
is one extra aggregate over a CTE that is already materialised.

It deliberately does **not** change what `stats` means. The RPC comment already
explains why the KPI strip is period-scoped and not search-scoped, and that
reasoning still holds — the fix is to put the filtered figure where the filter
is, under the table, not to redefine the headline cards mid-session.

### 1d. Sorting

Two new parameters, `p_sort text default 'date'` and `p_dir text default 'desc'`,
whitelisted to `date | amount | category` × `asc | desc`. Anything else falls
through to the current default.

Expressed as paired `CASE` expressions in the inner `ORDER BY` rather than
dynamic SQL — the function stays `language sql` and there is no `format()` to
audit. Six clauses, one non-null at a time, with `occurred_on desc, id desc` as
the final tiebreak so paging stays deterministic under equal amounts.

This gives up the `expenses_college_occurred_idx` for the two non-default sorts.
At 1,801 rows the planner already seq-scans this table (measured 4.6 ms when the
function was written), so it costs nothing today. Worth a comment in the
migration so nobody rediscovers it as a mystery at 50,000 rows.

### 1e. `expenses_export(...)`

A second function taking the same filter and sort arguments and returning a flat
`setof` — no aggregates, no `jsonb`, no limit. Separate rather than a raised
limit on `expenses_page` because the paged function's 200-row cap is a real
safety property and export is an explicit, rare, user-initiated action. Same
`revoke`/`grant execute to authenticated` footer as its sibling.

**Verification before applying:** per the standing rule in `AGENTS.md`, run this
against a throwaway local Postgres as a non-superuser first, then
`get_advisors` after applying. The specific things to assert: the comparison
window arithmetic on a period that crosses a year boundary, `reliquat` matching
`expense_standings` row for row, and that a non-privileged role can execute both
functions but not read `expense_payments` outside its own college.

---

## Phase 2 — Stop the page saying things that are not true

No new features. Every item here is the page contradicting itself or the data.
This phase can ship the day the migration lands.

**2a. The receipt.** `ExpensesPage.tsx:1092–1106` renders a hardcoded empty
state. Replace with: if `receipt_key` is present, show it as the reference
number it actually is (the form's label is "N° de reçu", the DB column is
`receipt_key`, and the field the form binds to is misleadingly called
`receiptPhotoPath` — rename that state variable in the same edit). If absent,
say "Aucun justificatif enregistré" and **delete the line "Formats acceptés :
PDF, PNG, JPG"**, which promises an upload that does not exist in the form.

**2b. The 760-vs-200 contradiction.** `ExpensesPage.tsx:1165` renders
`catExpenses.length`, capped by the 200-row fetch at line 244. Use the `total`
already returned by that same call for the header count, and label the list
below it as a preview ("les 200 plus récentes") when `total > 200`. One-line fix
for the count, one added sentence for the honesty.

**2c. The invisible period filter.** The two tabs are one component instance —
`routes.tsx:75` and `:78` render `<ExpensesPage>` at the same position, which is
why line 110's effect syncing `activeTab` to `mode` has to exist at all. So
`selectedPeriod` survives the navigation with no control on screen. Fix by
rendering the `PeriodFilter` on the categories tab too (Phase 5 needs it there
regardless), and by passing the period range into the category sheet's fetch at
line 244 so the list agrees with the KPI above it.

**2d. Footers that describe the wrong scope.** "Enregistrées au total" and
"Cumul des sorties de caisse" are correct only when the period is
"Toutes les périodes". Make the footer text a function of `selectedPeriod`.
Phase 3 rewrites these cards anyway; if Phase 3 is deferred, this is still worth
doing on its own.

**2e. Dates.** Add `formatDay(iso)` to `src/lib/utils.ts` next to `formatMoney`
— `fr-FR`, day-month-year, no time. Replace `toLocaleDateString()` at line 595
and line 1196, and `toLocaleString()` at line 1072. `occurred_on` is a plain
`date`; showing `00:00:00` next to it reads as a data fault to a non-technical
user, and browser-locale formatting puts `7/25/2026` inside a French app.

---

## Phase 3 — The KPI strip

Replaces the four cards at `ExpensesPage.tsx:501–530`. Same `StatCard`
component, same `variant="card"`, same grid — this is a change of *content*, not
of layout, and it should look like the same page afterwards.

| # | Label | Value | Footer |
|---|---|---|---|
| 1 | Dépensé sur la période | `stats.totalAmount` | `{count} dépenses · {comparison}` |
| 2 | Reste à payer | `stats.reliquatAmount` | `sur {unpaidCount} dépenses non soldées` |
| 3 | Poste le plus lourd | top category name | `{montant} · {pct} % du total` |
| 4 | Plus grosse dépense | `stats.maxAmount` | `{category} · {date}` |

**Card 2 is the reason for the whole phase.** Icon `AlertCircle`,
`valueClassName` switched to `text-negative` and `iconClassName` to
`bg-negative-bg text-negative` when the figure is above zero — reusing the sign
colouring the dashboard cards already do rather than inventing a treatment. When
it is zero it goes quiet and green-neutral with the footer "Tout est soldé",
which is genuinely good news and should read that way.

**Card 3 needs no new data.** `categoryStats` is already in memory; the top
entry and its share are a `useMemo` over the array the page already holds.

**Card 1's footer is where the honesty lives.** With a period selected:
`"56 dépenses · au 27 juillet · −12 % vs même période en juin"`. With "Toutes
les périodes": `"1 801 dépenses depuis septembre 2024"` and no comparison. Never
a percentage against a window of a different length — that is what Phase 1b's
arithmetic is for.

Dropped: "Aujourd'hui" (blank most days) and "Dépense moyenne" (84,695 F CFA,
an average of 2.25M salary runs and 28k supply purchases, describing nothing).
If the last-entry date is wanted, it goes as one line of muted text under the
`<h1>` at line 456, not as a card.

**Four cards, not five or six.** The temptation here is to keep the old ones and
add the new ones. A six-card strip is a strip nobody reads.

---

## Phase 4 — The table

**4a. Sortable headers.** Date, Catégorie and Montant become buttons carrying
`aria-sort`, with a chevron on the active column. New `sort`/`dir` state next to
`page`, threaded into `getExpensesPage` and added to the effect at line 183 that
resets to page 1 — a sort change must reset the page for the same reason a
filter change does.

**4b. A total row.** A `<TableFooter>` reading
`{filteredCount} dépenses filtrées — {formatMoney(filteredTotal)}`, spanning to
the amount column. This is the single change that answers "what did we spend on
salaries this quarter" for a user who has already done the right thing by
filtering. It sits under the table where the filtered set is, and leaves the
headline cards alone.

**4c. Payment state per row.** A compact indicator in the amount column: nothing
at all when `reliquat` is 0 (which is 94% of rows — a "Soldé" badge on 1,693 of
1,801 rows is noise), and `Reste 45 000` in `text-negative` beneath the amount
when it is not. Only the exception gets ink.

**4d. Reverse the responsive hiding order.** Line 585 hides
"Description / Motif" below `sm`; line 586 hides "Enregistré par" below `md`.
Swap them: the description is the row's name and is the last thing to drop; the
recorder is the first. Also give the truncated cell a `title` attribute so the
full motif is available on hover on desktop.

**4e. A sensible empty state for the new filters.** Line 631 checks
`searchQuery || selectedCategory !== "all"` but not the period, so filtering to
a month with no expenses tells the user to "Cliquez sur Enregistrer une dépense"
instead of to widen the period. One condition.

---

## Phase 5 — The categories page

The current table is Nom / Description / Actions. New shape:

| Nom | Description | Nb de saisies | Total dépensé | Part |
|---|---|---|---|---|

- **Part** is a percentage with a thin share bar behind it, using
  `--color-chart-1` — not the brand teals. `AGENTS.md` is explicit that
  `teal-950`/`teal-900` measure under the 0.1 chroma floor and read as two greys
  when used as data marks.
- **Sorted by total descending by default**, so "Salaires & primes, 29.6%" is
  the first thing on the page instead of the ninth thing you clicked.
- **Description drops below `md`** — same principle as 4d, the money is the
  point of this table now.
- **The period filter renders here** (Phase 2c), because these totals are
  already period-scoped whether or not the control is visible.

All of this is rendering. `categoryStats` is fetched with every page load
already; the numbers are sitting in memory while the current table shows names.

Categories with no expenses in the period show `0` and `0 %` rather than being
hidden — a budget line with nothing spent against it is information.

**Not in scope:** editing or deleting a category. There is no delete UI today,
which is why a "Test audit" category is stuck in the dropdown (see `STATE.md`).
That is a real gap and a separate decision, because deleting a category with
expenses attached is a data question, not a UI one.

---

## Phase 6 — Print / PDF export (revised — landed 2026-07-27)

Superseded the CSV plan below after Sam asked for PDF, easier to manipulate
than CSV, plus the option to print directly. Landed as a single mechanism
that already had to build the print report anyway: a print-only report view
(`hidden print:block` in `ExpensesPage.tsx`) plus one **Imprimer** button
that calls `window.print()`. The browser's own print dialog covers "how many
pages" (its page-range field) and "PDF" (the "Save as PDF" destination) —
no CSV file, no PDF-generation library, no custom column picker.

The report is a full, unpaged pull of whatever is currently filtered —
`getExpensesExport()` in `queries.ts`, paging through `expenses_export` in
1000-row chunks (see the PostgREST row-cap gotcha in `AGENTS.md`) — with
columns Date, Catégorie, Motif, Montant, Payé, Reste, Enregistré par, and a
total row. Colours are hardcoded black-on-white rather than the `text-ink`
theme tokens, since a report has no theme and those tokens flip to
near-white text in dark mode. `AppShell.tsx` hides the sidebar and header on
print (`print:hidden`); the page hides its own interactive UI the same way.

`window.print()` reads the DOM synchronously, so the row fetch is followed
by `flushSync(() => setPrintRows(rows))` before calling it — an ordinary
`setState` only guarantees the commit happens by the next paint, not before
the very next line of code runs.

**Not built:** a column picker. Sam confirmed "specifying what to print"
meant page range (the print dialog already provides this), not choosing
which columns appear.

---

### Superseded: the original CSV plan

A button beside the search box: **Exporter (CSV)**. Calls `expenses_export` with
the current filters and sort, builds the file in the browser, downloads
`depenses-<periode>-<date>.csv`.

Columns: Date, Catégorie, Motif, Montant, Payé, Reste, Enregistré par, N° de
reçu. Semicolon-separated and UTF-8 with a BOM — Excel in a French locale reads
comma-separated UTF-8 as one mangled column, and this file exists to be opened
in Excel.

**"Imprimer" is not in this plan.** A print button on a paged table prints ten
rows, and a print stylesheet good enough to lay out 1,801 rows is a bigger job
than the export that makes it unnecessary. If a printed board pack is the real
need, it should be its own thing built on the export, not a CSS media query.

*(This reasoning turned out to be backwards once print became the actual
ask: building the print-ready report is what makes both "print" and "export
as PDF" cheap, at the same time, via the browser's own dialog.)*

---

## Sequencing and what each phase costs

| Phase | Depends on | Rough size |
|---|---|---|
| 1 — migration | — | half a day, most of it local verification |
| 2 — truth fixes | 1 (only 2a needs it) | an afternoon |
| 3 — KPI strip | 1 | half a day |
| 4 — table | 1 | a day |
| 5 — categories | 1 | half a day |
| 6 — export | 1 | half a day |

2, 3, 4, 5 and 6 are independent of each other and can be taken in any order or
dropped individually. If only two phases are wanted, take **1 + 3** (the reliquat
card is the only genuinely new fact this page has ever shown) and **5** (the
cheapest large gain — the data is already loaded).

## Things I would push back on if they get added to this

- Charts on the expenses page. The dashboard already owns "Répartition du
  budget" as a doughnut. A second, differently-shaped view of the same split two
  clicks away is how two screens start disagreeing.
- Making the KPI cards follow the search box. It was decided deliberately and
  documented in the RPC; Phase 4b solves the underlying user need without
  changing what a headline number means while someone is typing.
- Supplier columns. The schema is ready and 0 rows use it. That is a product
  decision about how the college records purchases, and it does not start on
  this page.
