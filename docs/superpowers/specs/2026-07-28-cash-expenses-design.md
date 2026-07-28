# Cash expense model

## Decision

An expense is a completed outflow of college money. It is recorded only after payment by cash, mobile money, bank transfer, or another payment method. Unpaid bills, commitments, and planned purchases are outside this page and may become a separate workflow later.

## Page behavior

The Expenses page remains the cash-out ledger. It shows total spent, transaction count, largest category, and largest transaction for the selected period. It does not show a remaining-to-pay KPI or per-row remaining amount.

Each new expense records the existing amount, date, category, and reason plus:

- payee or recipient;
- payment method;
- optional receipt/reference.

The ledger shows the payee and payment method alongside the existing date, category, reason, and amount. Expense details repeat this information.

## Data and compatibility

The implementation adds nullable fields so existing expense history stays valid. Existing payment/remainder data is not deleted or reinterpreted by this change; it is simply not presented as part of the cash-expense workflow.

## Guardrails

Only users already allowed to create expenses can submit the form. Required fields are validated before submission. The page retains the existing server-side paging, filtering, printing, and accessible dialog patterns.

## Verification

Run lint and build. Verify that a new expense captures the recipient and payment method, the ledger and details display them, and no remaining-to-pay copy appears on the Expenses page.
