-- Category creation was the last unaudited write in the finance set.
-- `expense_categories` is the only one of those tables without a
-- log_activity() trigger, so EXPENSE_CATEGORY_CREATE has been handled in the
-- UI since the Adonis port and never once emitted.
--
-- Nothing else needs to change. log_activity() reads `new.college_id`, which
-- this table has, and stores to_jsonb(new) — for this table
-- {id, college_id, name, description, created_at}.
-- `normalize_activity_metadata` passes unmapped actions through untouched, and
-- formatActivityItem already reads `name` for this action, so the existing UI
-- copy lights up with no client change.
create trigger trg_log_expense_category
  after insert on public.expense_categories
  for each row execute function public.log_activity('EXPENSE_CATEGORY_CREATE');
