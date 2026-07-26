-- Realistic development seed for Wagnon Budget.
--
-- Applied to the REAL project on 2026-07-26 (Sam's explicit call: he wants it
-- to behave as production does, not as a branch). Run with service_role — the
-- financial tables grant no INSERT to `authenticated` beyond the app's own
-- paths, and none of them grant UPDATE or DELETE at all.
--
-- REVERSIBILITY. Every seeded row carries a deterministic id prefixed `5eed`,
-- so the entire seed can be removed with the teardown block at the bottom and
-- nothing else is touched. The pre-existing rows (one profile, one category,
-- one expense) are deliberately left alone.
--
-- Shape, after running:
--   15 investors        75,000,000 XOF committed
--   161 contributions   15 adhésion + 146 cotisation ≈ 50,000,000 XOF paid
--   1,800 expenses      152,435,900 XOF across 8 categories, Sep 2024–Jul 2026
--   1,693 payments      cash disbursed against settled expenses
--   6 other_income      178,500,000 XOF of school fees
--   ~3,675 activity_log rows, written by the existing AFTER INSERT triggers
--
-- Amounts are integers in XOF — no minor unit, never floats. See AGENTS.md.

\set college '''e55af449-8c95-41ee-9732-859ece20aaa1'''
\set admin   '''1f829b24-c667-4128-9ffb-554a208b075e'''

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
insert into expense_categories (id, college_id, name, description)
select ('5eed0002-0000-4000-8000-' || lpad(c.n::text,12,'0'))::uuid,
       :college, c.name, c.descr
from (values
  (1,'Salaires & primes','Rémunération du personnel enseignant et administratif'),
  (2,'Travaux & rénovation','Construction, réfection, aménagement des bâtiments'),
  (3,'Fournitures scolaires','Manuels, cahiers, craies, matériel pédagogique'),
  (4,'Électricité & eau','Factures CIE et SODECI'),
  (5,'Transport & carburant','Déplacements, carburant du véhicule de service'),
  (6,'Entretien & nettoyage','Produits d''entretien, prestations de ménage'),
  (7,'Administration','Frais bancaires, papeterie, communication'),
  (8,'Événements & examens','Organisation des examens blancs, cérémonies')
) as c(n,name,descr)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Investors. Targets vary so ownership_pct is not uniform.
-- ---------------------------------------------------------------------------
insert into investors (id, college_id, user_id, name, phone, membership_fee,
                       target_contribution, joined_at, created_by)
select ('5eed0001-0000-4000-8000-' || lpad(i.n::text,12,'0'))::uuid,
       :college, null, i.name,
       '+225 07 ' || lpad(((10000000 + i.n*373711) % 100000000)::text, 8, '0'),
       250000, i.target,
       timestamptz '2024-09-01' + (i.n * interval '11 days'), null
from (values
  (1,'Kouamé Adjoua', 6000000),(2,'Bamba Souleymane', 5000000),
  (3,'Traoré Fatoumata', 5000000),(4,'N''Guessan Yao', 4000000),
  (5,'Diallo Aminata', 6000000),(6,'Koffi Bernard', 5000000),
  (7,'Ouattara Salif', 4000000),(8,'Kone Mariam', 5000000),
  (9,'Yao Constant', 6000000),(10,'Bakayoko Ibrahim', 4000000),
  (11,'Assi Véronique', 5000000),(12,'Doumbia Karim', 5000000),
  (13,'Gnahoré Patrice', 4000000),(14,'Sangaré Awa', 6000000),
  (15,'Tanoh Serge', 5000000)
) as i(n,name,target)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Contributions. Adhésion is the flat entry fee and is excluded from
-- ownership by design; only cotisation counts. See AGENTS.md rule 3.
-- ---------------------------------------------------------------------------
insert into contributions (id, college_id, investor_id, type, amount, paid_at,
                           method, note, recorded_by)
select ('5eed0004-0000-4000-8000-' || lpad(i.seq::text,12,'0'))::uuid,
       :college, i.id, 'adhesion', i.membership_fee,
       i.joined_at + interval '2 days', 'Espèces', 'Droit d''adhésion', :admin
from (select id, membership_fee, joined_at,
             row_number() over (order by joined_at) as seq
      from investors where id::text like '5eed%') i
on conflict (id) do nothing;

with inv as (
  select id, target_contribution as target, joined_at,
         row_number() over (order by joined_at) as n
  from investors where id::text like '5eed%'
), plan as (
  select id, target, joined_at, n,
         6 + (n % 9) as k,                                -- 6..14 instalments
         (0.40 + ((n * 7) % 61)::numeric / 100) as ratio  -- 40..100% of target
  from inv
)
insert into contributions (id, college_id, investor_id, type, amount, paid_at,
                           method, note, recorded_by)
select ('5eed0004-0000-4000-8000-' || lpad((100 + p.n*100 + g)::text,12,'0'))::uuid,
       :college, p.id, 'cotisation',
       greatest(round(p.target * p.ratio / p.k), 1),
       p.joined_at + (g * interval '47 days') + interval '20 days',
       (array['Virement bancaire','Espèces','Mobile Money','Chèque'])[1 + (p.n + g) % 4],
       null, :admin
from plan p, lateral generate_series(0, p.k - 1) g
-- Guard the *paid_at* expression, not just the instalment offset. Checking
-- only `joined_at + g*47d` let the extra 20 days push the last instalment past
-- now(), which produced future-dated payments in the activity feed.
where p.joined_at + (g * interval '47 days') + interval '20 days' < now()
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Expenses. Weighted by category so the mix looks like a real school year:
-- salaries are rare and huge, supplies frequent and small.
-- ---------------------------------------------------------------------------
with base as (
  select g,
         case
           when g % 90 = 0               then 1
           when g % 90 in (1,2)          then 2
           when g % 90 between 3 and 40  then 3
           when g % 90 in (41,42)        then 4
           when g % 90 between 43 and 54 then 5
           when g % 90 between 55 and 69 then 6
           when g % 90 between 70 and 84 then 7
           else 8
         end as cat,
         (date '2024-09-01' + ((g * 397) % 690) * interval '1 day')::date as d
  from generate_series(1, 1800) g
)
insert into expenses (id, college_id, category_id, label, total_amount,
                      occurred_on, date_precision, recorded_by)
select ('5eed0003-0000-4000-8000-' || lpad(b.g::text,12,'0'))::uuid,
       :college,
       ('5eed0002-0000-4000-8000-' || lpad(b.cat::text,12,'0'))::uuid,
       case b.cat
         when 1 then 'Salaires du personnel enseignant'
         when 2 then (array['Réfection de la toiture bâtiment B','Peinture des salles de classe','Aménagement de la cour','Réparation de la clôture','Installation de ventilateurs'])[1 + b.g % 5]
         when 3 then (array['Craies et effaceurs','Manuels scolaires 6e','Cahiers de composition','Ramettes de papier','Matériel de laboratoire','Cartes et supports pédagogiques'])[1 + b.g % 6]
         when 4 then (array['Facture CIE','Facture SODECI'])[1 + b.g % 2]
         when 5 then (array['Carburant véhicule de service','Déplacement inspection','Transport de matériel'])[1 + b.g % 3]
         when 6 then (array['Produits d''entretien','Prestation de ménage','Évacuation des déchets'])[1 + b.g % 3]
         when 7 then (array['Frais bancaires','Papeterie administrative','Crédit de communication','Frais de dossier'])[1 + b.g % 4]
         else (array['Organisation examens blancs','Cérémonie de rentrée','Journée culturelle','Remise des bulletins'])[1 + b.g % 4]
       end,
       case b.cat
         when 1 then 1800000 + (b.g % 11) * 90000
         when 2 then  300000 + (b.g % 20) * 45000
         when 3 then    8000 + (b.g % 15) * 3000
         when 4 then   70000 + (b.g % 13) * 14000
         when 5 then   15000 + (b.g % 17) * 4500
         when 6 then    8000 + (b.g % 19) * 2800
         when 7 then    5000 + (b.g % 15) * 5200
         else          45000 + (b.g % 21) * 17000
       end,
       b.d, 'day', :admin
from base b
where b.d <= current_date
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Other income. Load-bearing: without school fees the dashboard reads as if
-- the college were running purely on investor money, which it is not.
-- ---------------------------------------------------------------------------
insert into other_income (id, college_id, label, amount, note, occurred_on, recorded_by)
select ('5eed0005-0000-4000-8000-' || lpad(t.n::text,12,'0'))::uuid,
       :college, t.label, t.amount, 'Encaissement des frais de scolarité', t.d, :admin
from (values
  (1,'Frais de scolarité — 1er trimestre 2024-2025', 32000000, date '2024-10-15'),
  (2,'Frais de scolarité — 2e trimestre 2024-2025',  28500000, date '2025-01-20'),
  (3,'Frais de scolarité — 3e trimestre 2024-2025',  26000000, date '2025-04-14'),
  (4,'Frais de scolarité — 1er trimestre 2025-2026', 34500000, date '2025-10-13'),
  (5,'Frais de scolarité — 2e trimestre 2025-2026',  30000000, date '2026-01-19'),
  (6,'Frais de scolarité — 3e trimestre 2025-2026',  27500000, date '2026-04-13')
) as t(n,label,amount,d)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Payments actually disbursed against settled expenses.
-- ---------------------------------------------------------------------------
insert into expense_payments (id, college_id, expense_id, amount, paid_at, note, recorded_by)
select ('5eed0006-0000-4000-8000-' ||
        lpad(row_number() over (order by e.occurred_on, e.id)::text,12,'0'))::uuid,
       :college, e.id, e.total_amount, e.occurred_on + interval '3 days', null, :admin
from expenses e
where e.id::text like '5eed%' and e.occurred_on < current_date - 45
on conflict (id) do nothing;

-- The AFTER INSERT triggers write activity_log via auth.uid(), which is NULL
-- under service_role — so attribute the seeded log rows to the admin.
update activity_log
   set user_id = :admin
 where user_id is null and (metadata->>'id') like '5eed%';

-- ---------------------------------------------------------------------------
-- TEARDOWN — removes the seed and nothing else. Order matters (FKs).
-- ---------------------------------------------------------------------------
-- delete from activity_log      where (metadata->>'id') like '5eed%';
-- delete from expense_payments  where id::text like '5eed%';
-- delete from expenses          where id::text like '5eed%';
-- delete from contributions     where id::text like '5eed%';
-- delete from other_income      where id::text like '5eed%';
-- delete from investors         where id::text like '5eed%';
-- delete from expense_categories where id::text like '5eed%';
