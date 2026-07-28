-- A cash expense records a completed outflow, not a future obligation.
alter table public.expenses
  add column payee text,
  add column payment_method text;

alter table public.expenses
  add constraint expenses_payment_method_check
  check (payment_method is null or payment_method in ('cash', 'mobile_money', 'bank_transfer', 'other'));
