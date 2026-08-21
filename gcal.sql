-- ============================================================
--  ESTIMAKE — Synchro Google Agenda "à vie" (aller-retour)
--  À lancer dans Supabase → SQL Editor (une seule fois).
--  Ajoute les colonnes de synchro à la table rdv + la table d'état gcal_sync.
-- ============================================================

-- 1) Colonnes de synchro sur les RDV
alter table public.rdv add column if not exists gcal_id    text;      -- id de l'événement Google
alter table public.rdv add column if not exists deleted    boolean default false;  -- suppression douce (tombstone)
alter table public.rdv add column if not exists updated_at timestamptz default now();

create index if not exists rdv_gcal_id_idx on public.rdv (gcal_id);

-- 2) Table d'état de synchro (un seul enregistrement : le syncToken Google)
create table if not exists public.gcal_sync (
  id         int primary key default 1,
  sync_token text,
  updated_at timestamptz default now()
);
insert into public.gcal_sync (id) values (1) on conflict (id) do nothing;

-- 3) Sécurité : gcal_sync n'est jamais exposée au navigateur (aucune policy anon).
--    La fonction serveur y accède avec la clé service_role.
alter table public.gcal_sync enable row level security;
