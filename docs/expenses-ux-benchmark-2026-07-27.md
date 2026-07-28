# Expenses pages — user benchmark, 27 July 2026

Written from the point of view of the person who actually uses this screen: the
treasurer or accountant at Wagnon, and the investor who logs in once a month to
see where the money went. No engineering knowledge assumed. Every number below
was measured against the live project on 27 July 2026.

Scope: `/expenses` (the ledger) and `/expense-categories` (the categories tab).
Both are `src/features/expenses/ExpensesPage.tsx`.

## The data behind the screen, as of today

- 1,801 expenses, 1 September 2024 → 25 July 2026, across 9 categories.
- Committed total: 152,535,900 F CFA.
- Actually paid: 144,367,100 F CFA.
- **Still owed: 8,168,800 F CFA across 108 expenses** (`expense_standings`).
- Category concentration: Salaires & primes 29.6%, Travaux & rénovation 15.5%,
  Fournitures scolaires 14.3%. The bottom three categories are 10.6% combined.
- Monthly run rate: Jan 7.75M, Feb 6.84M, Mar 6.36M, Apr 6.30M, May 8.63M,
  Jun 7.32M, Jul 3.13M (partial, to the 25th).
- 0 rows have a supplier, a receipt, a note, a quantity or a unit price, even
  though every one of those columns exists.
- 0 expenses recorded today, which is what the fourth KPI card is about.

## What I see when I open the page

Four cards across the top: Nombre de dépenses, Montant total, Dépense moyenne,
Aujourd'hui. Then a search box, a category dropdown, and a table of ten rows:
Date, Catégorie, Description, Enregistré par, Montant, an eye icon.

It is calm, it is legible, and nothing on it is ugly. The problem is not the
look. The problem is that after reading it for a minute I still cannot answer
the three questions I came with:

1. Are we spending more than we did last month?
2. Do we still owe anybody money?
3. Which category is eating the budget?

## Findings, worst first

### 1. "Montant total" is not the cash that left the building

The card reads 152,535,900 F CFA and the caption underneath says *"Cumul des
sorties de caisse"* — total cash outflows. Only 144,367,100 F CFA has actually
been paid. The figure is 8,168,800 F CFA too high as a cash number, and 108
expenses are sitting partly unpaid.

Nothing anywhere on either page mentions this. The database already computes it
— `expense_standings` has `paid` and `reliquat` per expense — the screen simply
never asks for it. As the person who has to pay suppliers, this is the single
most important number on the page and it is missing. As an investor, I am being
shown a spending figure and a cash figure as if they were the same thing.

### 2. One of the four headline slots is empty most days

"Aujourd'hui" reads **0 F CFA / 0 dépense(s) aujourd'hui** right now. Even on a
normal day it reads something like 62,200 F CFA over 2 lines — true, and useless.
Nobody makes a decision from today's expense total. It is a quarter of the most
valuable real estate on the page spent on a number that is blank or trivial.

Meanwhile the comparison I actually want is nowhere: June was 7,321,500 and July
is 3,125,500 so far. Is that good? The page will not say. There is no trend, no
"vs. last month", no direction, on any of the four cards.

### 3. "Dépense moyenne" describes an expense that does not exist

84,695 F CFA. That is an average over salary payments of ~2,250,000 and pencil
purchases of ~28,000. No real expense is anywhere near it, and it moves for
reasons that have nothing to do with spending discipline. A median, or the
largest expense of the period, would tell me something I could act on.

### 4. The Categories page shows no money at all

Three columns: Nom, Description, Actions. Nine rows. To find out that salaries
are 29.6% of everything the college spends, I have to open nine side panels one
after another and hold nine numbers in my head.

The totals are already loaded in the page's memory when it renders — they come
back with every expenses query as `categoryStats`. They are just not put on
screen. This is the cheapest large improvement available on either page.

### 5. The category panel contradicts itself, in the same panel

Open "Fournitures scolaires". The box at the top says **Nombre de Saisies: 760**.
Two centimetres below, the list header says **Historique des Dépenses (200)**,
because that list is fetched with a 200-row cap. Two different counts of the
same thing, side by side. The first time a user notices this, they stop trusting
every other number on the page.

### 6. The period filter is invisible on Categories but still applied

Set "Ce mois-ci" on Dépenses, then click Catégories. The period dropdown is not
rendered on that tab, but the filter is still in effect — the two tabs are the
same component and the setting survives the navigation. So the totals in the
category panels are month-scoped, with nothing on screen saying so. A user who
navigated in that order is reading July numbers believing they are all-time
numbers.

### 7. The receipt number I typed disappears

The expense form has a field, "N° de reçu (optionnel)", with a placeholder like
`REÇU-2026-0042`. I fill it in, I save. I open the expense again, and the
"Justificatif / Pièce jointe" panel shows a dashed empty box: *"Aucun fichier
joint à cette dépense — Formats acceptés : PDF, PNG, JPG"*.

That panel is hardcoded. It never reads the value that was saved. So the page
tells me my receipt is missing when I just entered it, and at the same time
advertises PDF/PNG/JPG upload that does not exist anywhere in the form. Two
false statements in one box, on the screen whose stated purpose is *"Fiche de
contrôle comptable immuable"*.

### 8. On a phone, the column that says what was bought is the one that is hidden

"Description / Motif" is hidden below the `sm` breakpoint; "Enregistré par" is
hidden below `md`. So on a phone I get: a date, a category badge, an amount, and
an eye icon. The description is the only thing that identifies the row — it is
the row's name — and it is the first thing dropped. On desktop it is also
truncated at 200px with no tooltip, so longer motifs are unreadable without
opening the panel.

The hiding order should be reversed: "Enregistré par" is the column I can lose.

### 9. Money never follows the filter

Filter to "Salaires & primes" and the KPI strip keeps showing the all-category
figures. This is deliberate and documented in the RPC, and the reasoning is
sound — but the consequence is that filtering to a category tells me the *number
of rows* and never the *amount*. There is no total row under the table either.
So the most natural question on this page — "what did we spend on salaries this
quarter?" — has no answer on screen, even though the user did exactly the right
thing to ask it.

### 10. No sorting, no total, no export

1,801 rows. I cannot sort by amount, so "what were our ten biggest expenses this
year" is unanswerable. I cannot get a sum of what I filtered. I cannot export or
print. A treasurer preparing a board meeting has to copy figures off the screen
by hand.

### 11. Small things that cost trust

- Card footers say "Enregistrées au total" and "Cumul des sorties de caisse"
  even when a period is selected, so they describe the wrong scope.
- Dates use the browser's locale, not French. On an English-configured laptop
  the ledger reads `7/25/2026` inside an otherwise entirely French app.
- The detail panel shows a *time* (`toLocaleString()`) on a field that is a plain
  date, so every expense reads `25/07/2026 00:00:00` — which looks like a
  data-entry fault to a non-technical reader.
- The search placeholder says "Filtrer par motif ou catégorie", which is
  accurate and good. Worth keeping as the model for the other copy.

## What I would put on the page instead

### KPI strip — four cards, all period-aware, all with a comparison

| # | Card | Value today | Footer |
|---|------|-------------|--------|
| 1 | **Dépensé sur la période** | 3 125 500 F CFA | 56 dépenses · au 25 juillet · −57 % vs juin |
| 2 | **Reste à payer** | 8 168 800 F CFA | sur 108 dépenses non soldées — red when > 0 |
| 3 | **Poste le plus lourd** | Salaires & primes | 45 090 000 F CFA · 29,6 % du total |
| 4 | **Plus grosse dépense** | largest single row of the period | its category and date |

Card 2 is the genuinely new fact. Card 3 answers "where does the money go"
without a single click. Card 1 answers "are we accelerating". "Aujourd'hui"
disappears; if the last-entry date matters, it belongs as one line of text under
the page title ("Dernière saisie : 25 juillet 2026"), not as a card.

An honest incomplete-period marker matters on card 1 — comparing 25 days of July
against 30 days of June without saying so is exactly the kind of thing that
makes a board argument go sideways.

### Table

- A **total row** pinned at the bottom that respects every active filter.
- **Sortable** Date, Montant and Catégorie.
- A **Payé / Reste** indicator per row — a quiet "Soldé" badge, or "Reste
  45 000" in red. This is what turns the ledger into something you can chase
  payments from.
- Swap the responsive hiding order: keep Description on mobile, drop
  "Enregistré par" first.
- **Exporter CSV** and **Imprimer**.

### Categories page

Add the three columns the data already contains: **Total dépensé**, **Nb de
saisies**, **% du total**, with a thin share bar behind the percentage, sorted by
total descending. Show the period filter here too, since it is already being
applied. That turns a list of nine labels into the budget breakdown that the
whole page is named after.

### Bugs to fix regardless of what is decided above

1. Display the saved receipt number in the detail panel; remove the
   "Formats acceptés : PDF, PNG, JPG" promise until upload exists.
2. Fix the 760-vs-200 contradiction in the category panel.
3. Show the period filter on the Categories tab, or reset it on navigation.
4. Make card footers describe the selected period instead of "au total".
5. Force `fr-FR` dates; drop the time from the detail panel.

## Not proposed, but worth naming

The schema carries `supplier_id`, `quantity`, `unit`, `unit_price` and `note` on
every expense, and a whole `suppliers` table — all of it empty, none of it on
screen. "Who are we paying, and are we paying them too much" is a top-three
investor question and the schema is already shaped to answer it. That is a
product decision, not a UI fix, so it is listed here rather than above.
