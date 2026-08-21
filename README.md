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

## Restyling IA d'une pièce (photo → home-staging virtuel)

`api/restyle.js` (fonction serverless Vercel) : Claude analyse la photo et rédige
un prompt de style, puis Stability AI produit l'image restylée en conservant
l'architecture de la pièce. Pour l'activer, ajoute 2 variables d'environnement
dans **Vercel → Settings → Environment Variables**, puis redéploie :

- `STABILITY_API_KEY` — **obligatoire**, clé sur https://platform.stability.ai/ (facturé à l'image, ~quelques centimes)
- `ANTHROPIC_API_KEY` — *optionnel*, clé sur https://console.anthropic.com/ (améliore le prompt via Claude)

Tant que `STABILITY_API_KEY` n'est pas configurée, le bouton « Générer la version
restylée » affiche un message d'aide au lieu de planter. ⚠️ Les clés ne vont
**jamais** dans le code front — uniquement dans les variables d'environnement Vercel.

## Agenda ↔ Google Agenda — synchro « à vie », aller-retour

La synchro se fait **côté serveur** (fonction `api/gcal.js`) avec un **compte de
service Google** : jeton permanent, **aucune reconnexion, aucun popup**. Elle marche
dans les deux sens — app → Google (à chaque création/modif/suppression) et
Google → app (cron Vercel toutes les 5 min + bouton « Synchroniser »).

**Configuration (une seule fois) :**

1. **Compte de service** — Google Cloud Console → projet ESTIMAKE → *IAM et admin →
   Comptes de service* → **Créer** (nom `estimake-sync`) → puis onglet **Clés →
   Ajouter une clé → JSON** : un fichier `.json` se télécharge.
2. **Calendar API** — *APIs et services → Bibliothèque* → activer **Google Calendar API**.
3. **Partager le calendrier** — dans Google Agenda, ouvrir les *Paramètres* du
   calendrier cible → *Partager avec des personnes* → ajouter l'**e-mail du compte
   de service** (`…@…iam.gserviceaccount.com`, présent dans le JSON) avec le droit
   **« Apporter des modifications aux événements »**.
4. **Variables Vercel** (*Settings → Environment Variables*), puis redéployer :
   - `GOOGLE_SA_KEY_JSON` — **tout** le contenu du fichier `.json`
   - `GCAL_ID` — l'identifiant du calendrier cible (souvent l'e-mail du compte)
   - `SB_URL` — l'URL du projet Supabase
   - `SB_SERVICE_KEY` — la clé **service_role** Supabase (Settings → API)
5. **SQL** — lancer `gcal.sql` dans Supabase (colonnes de synchro + table d'état).
6. Le cron (`vercel.json`) s'active automatiquement au déploiement.

> ⚠️ La clé service_role et le JSON du compte de service ne vont **jamais** dans le
> code / le repo — uniquement dans les variables d'environnement Vercel (serveur).

Tant que ces variables ne sont pas renseignées, l'agenda fonctionne normalement en
local (Supabase), la synchro Google reste simplement en veille (réponse 503 ignorée).

## Prochaines étapes (V2)
- Connexion par compte (Supabase Auth) + espace par négociateur, vue directeur consolidée.
- Comparables DVF récupérés en direct (API DVF / cadastre / Géorisques).
- Génération réelle du dossier d'estimation en PDF.
- Rapprochement automatique acquéreurs ↔ biens, rédaction d'annonces assistée.
