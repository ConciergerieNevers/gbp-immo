-- ============================================================
--  ESTIMAKE — Stockage des photos (Supabase Storage)
--  À lancer dans Supabase → SQL Editor (une seule fois),
--  pour que les photos des biens soient conservées.
-- ============================================================

-- Colonne photo sur les biens
alter table public.biens add column if not exists photo_url text;

-- Bucket public "biens" (lecture publique des photos)
insert into storage.buckets (id, name, public)
values ('biens', 'biens', true)
on conflict (id) do nothing;

-- Règles d'accès au bucket (phase démo : dépôt/lecture ouverts)
-- ⚠️ À restreindre à "authenticated" avant les vraies données client.
drop policy if exists "biens_photos_read"   on storage.objects;
drop policy if exists "biens_photos_write"  on storage.objects;
drop policy if exists "biens_photos_update" on storage.objects;

create policy "biens_photos_read"   on storage.objects for select using (bucket_id = 'biens');
create policy "biens_photos_write"  on storage.objects for insert with check (bucket_id = 'biens');
create policy "biens_photos_update" on storage.objects for update using (bucket_id = 'biens') with check (bucket_id = 'biens');
