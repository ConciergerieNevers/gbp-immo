-- ============================================================
--  ESTIMAKE — Sécurisation RLS + suppression définitive (corbeille)
--  À lancer UNE FOIS dans Supabase → SQL Editor.
--
--  1) Retire les policies "démo" ouvertes à tout le monde (anon)
--     → les données clients ne sont plus lisibles/modifiables sans connexion.
--  2) Donne tous les droits (lecture/écriture/suppression) aux
--     utilisateurs CONNECTÉS (Jimmy) — l'app exige la connexion.
--  3) La suppression définitive depuis la corbeille fonctionne
--     grâce aux policies "for delete".
--  NB : api/gcal.js utilise la clé service_role → non concerné par la RLS.
-- ============================================================

-- ---------- 1) Nettoyage des policies ouvertes (anon) ----------
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname='public'
      and tablename in ('biens','contacts','estimations','rdv','ventes','taches','gcal_sync')
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- ---------- 2) Accès complet pour les utilisateurs connectés ----------
do $$
declare t text;
begin
  foreach t in array array['biens','contacts','estimations','rdv','ventes','taches','gcal_sync']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)',  t||'_auth_sel', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (true)', t||'_auth_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)', t||'_auth_upd', t);
    execute format('create policy %I on public.%I for delete to authenticated using (true)',  t||'_auth_del', t);
  end loop;
end $$;

-- ---------- 3) Storage : lecture publique conservée (les photos sont affichées
-- via URL publique), mais écriture/écrasement réservés aux connectés ----------
drop policy if exists "biens_photos_write"  on storage.objects;
drop policy if exists "biens_photos_update" on storage.objects;
do $$
begin
  begin
    create policy "biens_auth_insert" on storage.objects for insert to authenticated with check (bucket_id='biens');
  exception when duplicate_object then null; end;
  begin
    create policy "biens_auth_update" on storage.objects for update to authenticated using (bucket_id='biens');
  exception when duplicate_object then null; end;
  begin
    create policy "biens_auth_delete" on storage.objects for delete to authenticated using (bucket_id='biens');
  exception when duplicate_object then null; end;
end $$;

-- Recharge le cache API
notify pgrst, 'reload schema';
