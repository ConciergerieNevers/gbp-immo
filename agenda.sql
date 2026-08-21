-- ============================================================
--  ESTIMAKE — Agenda (rendez-vous)
--  À lancer dans Supabase → SQL Editor (une seule fois) pour que
--  les RDV créés dans l'app soient conservés en base.
-- ============================================================

create table if not exists public.rdv (
  id          uuid primary key default gen_random_uuid(),
  titre       text not null,
  type        text,                 -- Estimation | Visite | Signature | Appel | Autre
  date        date not null,
  heure       text,                 -- 'HH:MM'
  lien        text,                 -- bien / contact associé
  note        text,
  created_at  timestamptz default now()
);

alter table public.rdv enable row level security;
create policy "rdv_read_demo" on public.rdv for select to anon          using (true);
create policy "rdv_auth"      on public.rdv for all    to authenticated using (true) with check (true);
