# ESTIMAKE

Application de pilotage d'activité + estimation immobilière terrain (agence de démo : GBP, secteur Nevers).
Front statique (`index.html`, sans build), base de données **Supabase**, hébergement **Vercel**.

## Écrans (MVP)
1. **Cockpit** — CA réalisé / prévisionnel, commissions, mandats, tunnel de conversion, objectifs.
2. **Biens** — portefeuille, recherche, fiche complète (propriétaire, acquéreurs, historique).
3. **Contacts** — vendeurs / acquéreurs / prospects, relances, prochaines actions.
4. **Estimation** — adresse → caractéristiques → comparables DVF → ajustements d'expert (recalcul en direct) → fourchette + prix conseillé → dossier PDF.
5. **Agence** — classement/challenge, CA équipe, mandats, exclusivités.

## Architecture
- `index.html` — toute l'app (UI + moteur d'estimation + couche données).
- `schema.sql` — tables Supabase + sécurité (RLS).
- `seed.sql` — données de démonstration (secteur Nevers).
- `manifest.webmanifest` — installable sur iPad / iPhone (PWA).

**Repli intelligent** : tant que Supabase n'est pas configuré, l'app tourne sur des
données de démonstration intégrées. Elle se déploie et fonctionne donc immédiatement,
puis bascule en « live » dès que la base est branchée.

## Sécurité (règle non négociable)
- Le front n'utilise QUE la clé **anon** (publique).
- La clé **service_role** ne doit JAMAIS apparaître dans le code ni dans ce repo.
- Le SQL est lancé par Mathieu dans Supabase (jamais automatisé depuis le code).
- RLS activé : la clé publique ne lit aucune donnée client réelle.

---

## Mise en ligne — checklist (≈ 5 min)

### 1) Base de données — Supabase
1. Créer un **nouveau projet** Supabase dédié à ESTIMAKE (à ne pas mélanger avec Thermo Centre).
2. SQL Editor → coller/exécuter **`schema.sql`**, puis **`seed.sql`** (facultatif).
3. Settings → API → copier `Project URL` et la clé **anon public**.
4. Dans `index.html`, bloc `CONFIG SUPABASE`, renseigner `SB_URL` et `SB_KEY`.

### 2) Dépôt — GitHub (org ConciergerieNevers)
Repo cible : `git@github.com:ConciergerieNevers/estimake.git`
Créer le dépôt **vide** (sans README) sur https://github.com/organizations/ConciergerieNevers/repositories/new,
puis pousser (le remote est déjà configuré en local) :
```bash
cd ~/Desktop/projet_estimake
git push -u origin main
```

### 3) Hébergement — Vercel
1. vercel.com → New Project → importer `ConciergerieNevers/estimake`.
2. Framework preset : **Other** (site statique, aucun build).
3. Deploy. Chaque `git push` redéploie automatiquement.

> ⚠️ Rappel Vercel Pro : les commits doivent être signés avec
> `primoconciergerie58@gmail.com`, sinon le déploiement passe en « Blocked ».

## Prochaines étapes (V2)
- Connexion par compte (Supabase Auth) + espace par négociateur, vue directeur consolidée.
- Comparables DVF récupérés en direct (API DVF / cadastre / Géorisques).
- Génération réelle du dossier d'estimation en PDF.
- Rapprochement automatique acquéreurs ↔ biens, rédaction d'annonces assistée.
