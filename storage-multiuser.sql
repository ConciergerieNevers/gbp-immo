-- ============================================================================
--  ESTIMAKE — cloisonnement du stockage des photos
--
--  Constat de l'audit : les regles ne portaient que sur le nom du bucket.
--  Tout compte connecte pouvait donc ECRASER ou SUPPRIMER les photos des autres.
--
--  Choix assume : la LECTURE reste ouverte. Le bucket est public (les photos de
--  biens finissent de toute facon dans les annonces) et les URL contiennent un
--  identifiant aleatoire. Ce sont les ECRITURES qui sont verrouillees.
-- ============================================================================

begin;

-- 1. les fichiers deja presents sans proprietaire reviennent au premier compte
update storage.objects
set owner = (select id from auth.users order by created_at asc limit 1)
where bucket_id = 'biens' and owner is null;

-- 2. on repart de zero sur les regles du bucket
drop policy if exists biens_photos_read   on storage.objects;
drop policy if exists biens_photos_write  on storage.objects;
drop policy if exists biens_photos_update on storage.objects;
drop policy if exists biens_photos_delete on storage.objects;

-- lecture : ouverte aux comptes connectes (le bucket est public de toute facon)
create policy biens_photos_read on storage.objects
  for select to authenticated
  using (bucket_id = 'biens');

-- depot : autorise, le proprietaire est pose automatiquement par le stockage
create policy biens_photos_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'biens');

-- remplacement : uniquement ses propres fichiers (ou l'administrateur)
create policy biens_photos_update on storage.objects
  for update to authenticated
  using      (bucket_id = 'biens' and (owner = auth.uid() or public.est_admin()))
  with check (bucket_id = 'biens' and (owner = auth.uid() or public.est_admin()));

-- suppression : idem
create policy biens_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'biens' and (owner = auth.uid() or public.est_admin()));

commit;

-- verification
select count(*) as fichiers, count(owner) as avec_proprietaire
from storage.objects where bucket_id = 'biens';
