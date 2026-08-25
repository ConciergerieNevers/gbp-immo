-- ESTIMAKE — colonnes de suivi commercial (acquéreur lié + commission personnalisée)
-- À lancer UNE FOIS dans Supabase → SQL Editor.
alter table public.ventes add column if not exists acquereur  text;
alter table public.ventes add column if not exists part_perso integer;
notify pgrst, 'reload schema';
