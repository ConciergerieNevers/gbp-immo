-- ============================================================================
--  ESTIMAKE — MULTI-UTILISATEUR + ADMINISTRATION
--
--  Ce script rend l'application vendable à plusieurs personnes :
--  chaque utilisateur ne voit QUE ses propres données, et un rôle « admin »
--  peut tout voir pour administrer le service.
--
--  À LANCER EN UNE SEULE FOIS dans Supabase → SQL Editor.
--  Il est idempotent : le relancer ne casse rien.
--
--  ⚠️ IMPORTANT — il fait un « backfill » : toutes les lignes existantes sont
--  attribuées au PREMIER compte créé (celui de Jimmy). Sans ça, les données
--  actuelles deviendraient invisibles pour tout le monde.
-- ============================================================================

begin;

-- ---------------------------------------------------------------- 1. profils
create table if not exists public.profils (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  nom         text,
  role        text not null default 'agent',           -- 'agent' | 'admin'
  agence      text,
  actif       boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.profils enable row level security;

-- un profil est créé automatiquement à chaque inscription
create or replace function public.creer_profil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profils (id, email, nom)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'nom', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.creer_profil();

-- les comptes déjà existants récupèrent leur profil
insert into public.profils (id, email, nom)
select u.id, u.email, split_part(u.email, '@', 1)
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------- 2. rôle admin
-- security definer : la fonction lit profils sans repasser par RLS (sinon récursion)
create or replace function public.est_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profils
    where id = auth.uid() and role = 'admin' and actif
  );
$$;

-- le premier compte créé devient administrateur
do $$
declare premier uuid;
begin
  select id into premier from auth.users order by created_at asc limit 1;
  if premier is not null then
    update public.profils set role = 'admin' where id = premier;
  end if;
end $$;

-- ---------------------------------------------------------------- 3. propriétaire sur chaque table
do $$
declare t text;
begin
  foreach t in array array['biens','contacts','estimations','rdv','ventes','taches'] loop
    execute format('alter table public.%I add column if not exists user_id uuid references auth.users(id) on delete cascade', t);
    execute format('alter table public.%I alter column user_id set default auth.uid()', t);
    execute format('create index if not exists %I on public.%I (user_id)', t || '_user_id_idx', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- 4. BACKFILL
-- toutes les lignes sans propriétaire vont au premier compte (Jimmy)
do $$
declare premier uuid; t text; n bigint;
begin
  select id into premier from auth.users order by created_at asc limit 1;
  if premier is null then
    raise exception 'Aucun compte dans auth.users : crée le compte avant de lancer ce script.';
  end if;
  foreach t in array array['biens','contacts','estimations','rdv','ventes','taches'] loop
    execute format('update public.%I set user_id = %L where user_id is null', t, premier);
    get diagnostics n = row_count;
    raise notice 'Table % : % ligne(s) attribuée(s).', t, n;
  end loop;
end $$;

-- ---------------------------------------------------------------- 5. règles d'accès
-- On supprime TOUTES les anciennes règles (y compris la lecture anonyme de secours)
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('biens','contacts','estimations','rdv','ventes','taches','profils')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- chacun chez soi ; l'administrateur voit tout
do $$
declare t text;
begin
  foreach t in array array['biens','contacts','estimations','rdv','ventes','taches'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (user_id = auth.uid() or public.est_admin())
        with check (user_id = auth.uid() or public.est_admin())
    $f$, t || '_proprietaire', t);
  end loop;
end $$;

-- profils : chacun lit et modifie le sien, l'administrateur gère tout le monde
create policy profils_lecture on public.profils
  for select to authenticated
  using (id = auth.uid() or public.est_admin());

create policy profils_maj_soi on public.profils
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profils p where p.id = auth.uid()));

create policy profils_admin on public.profils
  for all to authenticated
  using (public.est_admin())
  with check (public.est_admin());

commit;

-- ---------------------------------------------------------------- 6. vérification
-- Ce que tu dois voir : ton compte en 'admin', et tes lignes bien attribuées.
select p.email, p.role, p.actif from public.profils p order by p.created_at;

select 'biens' as table_, count(*) total, count(user_id) avec_proprietaire from public.biens
union all select 'contacts', count(*), count(user_id) from public.contacts
union all select 'estimations', count(*), count(user_id) from public.estimations
union all select 'rdv', count(*), count(user_id) from public.rdv
union all select 'ventes', count(*), count(user_id) from public.ventes
union all select 'taches', count(*), count(user_id) from public.taches;
