-- ESTIMAKE — suivi commercial (à lancer UNE FOIS dans Supabase → SQL Editor)
alter table public.ventes add column if not exists acquereur  text;
alter table public.ventes add column if not exists part_perso integer;
alter table public.biens  add column if not exists suivi      jsonb;
notify pgrst, 'reload schema';
