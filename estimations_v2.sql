-- ============================================================
--  ESTIMAKE — Estimations V2 (client, description, ajustements…)
-- ============================================================
alter table public.estimations add column if not exists complement    text;
alter table public.estimations add column if not exists client        text;
alter table public.estimations add column if not exists client_email  text;
alter table public.estimations add column if not exists description   text;
alter table public.estimations add column if not exists prix_final    integer;
alter table public.estimations add column if not exists data          jsonb;
