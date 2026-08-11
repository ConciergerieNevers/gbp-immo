-- ============================================================
--  GBP Immo — schéma Supabase
--  À lancer dans Supabase → SQL Editor (une seule fois).
--  RÈGLE DE SÉCURITÉ : la clé « service_role » ne doit JAMAIS
--  apparaître dans index.html ni dans le repo. Le front n'utilise
--  que la clé « anon » (publique). RLS ci-dessous protège les données.
-- ============================================================

-- ---------- BIENS ----------
create table if not exists public.biens (
  id             uuid primary key default gen_random_uuid(),
  reference      text unique,
  type           text,                       -- 'Maison' | 'Appartement'
  adresse        text not null,
  secteur        text,
  prix           integer,
  surface        integer,                     -- m² habitables
  terrain        integer,                     -- m² terrain (0 si appartement)
  pieces         integer,
  chambres       integer,
  annee          integer,
  dpe            text,                         -- 'A'..'G'
  garage         boolean default false,
  statut         text default 'Simple',       -- 'Exclusif' | 'Simple' | 'Compromis' | 'Vendu'
  proprietaire   text,
  nb_acquereurs  integer default 0,
  historique     jsonb default '[]'::jsonb,   -- [["Mandat signé","2 août 2026"], ...]
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- ---------- CONTACTS (vendeurs / acquéreurs / prospects) ----------
create table if not exists public.contacts (
  id                uuid primary key default gen_random_uuid(),
  role              text not null,            -- 'vendeur' | 'acquereur' | 'prospect'
  nom               text not null,
  detail            text,                     -- bien lié / recherche / origine
  statut            text,                     -- 'Exclusif' | 'Simple' | 'Chaud' | 'Tiède' | budget...
  budget            integer,                  -- acquéreurs uniquement
  derniere_relance  text,
  prochaine_action  text,
  couleur           text default '#6a9',
  created_at        timestamptz default now()
);

-- ---------- ESTIMATIONS ----------
create table if not exists public.estimations (
  id             uuid primary key default gen_random_uuid(),
  adresse        text,
  type           text,
  surface        integer,
  valeur_basse   integer,
  valeur_haute   integer,
  prix_conseille integer,
  created_at     timestamptz default now()
);

-- ============================================================
--  RLS — RÈGLES D'ACCÈS
--  Phase MVP/démo (données FICTIVES) : on autorise la clé anon à
--  lire le catalogue et à enregistrer des estimations, pour que
--  l'app fonctionne immédiatement sans page de login.
--
--  ⚠️ AVANT DE SAISIR DE VRAIES DONNÉES CLIENT : passer en
--  Supabase Auth (V2) et remplacer les policies "anon" ci-dessous
--  par "authenticated". Voir le bloc commenté en bas de fichier.
-- ============================================================
alter table public.biens       enable row level security;
alter table public.contacts    enable row level security;
alter table public.estimations enable row level security;

-- Lecture du catalogue et des contacts (démo)
create policy "biens_read_demo"    on public.biens    for select to anon using (true);
create policy "contacts_read_demo" on public.contacts for select to anon using (true);

-- Estimations : lecture + création (le bouton « Générer le dossier »)
create policy "estim_read_demo"   on public.estimations for select to anon using (true);
create policy "estim_insert_demo" on public.estimations for insert to anon with check (true);

-- Accès complet pour un compte connecté (déjà prêt pour la V2 Auth)
create policy "biens_auth"       on public.biens       for all to authenticated using (true) with check (true);
create policy "contacts_auth"    on public.contacts    for all to authenticated using (true) with check (true);
create policy "estimations_auth" on public.estimations for all to authenticated using (true) with check (true);

-- ============================================================
--  V2 — SÉCURISATION (à activer avant les vraies données) :
--  drop policy "biens_read_demo"    on public.biens;
--  drop policy "contacts_read_demo" on public.contacts;
--  drop policy "estim_read_demo"    on public.estimations;
--  drop policy "estim_insert_demo"  on public.estimations;
--  → il ne reste alors que l'accès "authenticated".
-- ============================================================
