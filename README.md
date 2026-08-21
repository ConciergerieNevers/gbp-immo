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

## Agenda ↔ Google Agenda (auto-sync)

L'agenda peut se synchroniser avec un compte Gmail (créer / déplacer / supprimer
un RDV met à jour Google Agenda). Tout se passe **côté navigateur** — pas de
secret, pas de backend — mais il faut un **identifiant OAuth Google** (gratuit) :

1. **Google Cloud Console** ([console.cloud.google.com](https://console.cloud.google.com/)) → crée un projet.
2. **APIs & Services → Bibliothèque** → active **Google Calendar API**.
3. **APIs & Services → Écran de consentement OAuth** → type *Externe* → nom « ESTIMAKE » → ajoute ton e-mail → ajoute-toi comme **utilisateur de test**.
4. **APIs & Services → Identifiants → Créer → ID client OAuth** → type **Application Web** → dans **Origines JavaScript autorisées** ajoute `https://gbp-immo.vercel.app` (et `http://localhost:PORT` pour tester) → Créer.
5. Copie l'**ID client** (finit par `.apps.googleusercontent.com`).
6. Colle-le dans `GOOGLE_CLIENT_ID` en haut d'`index.html`, commit + push (redéploie).
7. Sur le site → **Agenda → Connecter Google** → choisis le compte Gmail (même un autre) → autorise → choisis le calendrier cible. Les RDV s'y synchronisent.

Tant que `GOOGLE_CLIENT_ID` est vide, le bouton reste inactif ; le lien « Ajouter
à Google Agenda » (1 clic par RDV) fonctionne toujours sans aucune config.

## Prochaines étapes (V2)
- Connexion par compte (Supabase Auth) + espace par négociateur, vue directeur consolidée.
- Comparables DVF récupérés en direct (API DVF / cadastre / Géorisques).
- Génération réelle du dossier d'estimation en PDF.
- Rapprochement automatique acquéreurs ↔ biens, rédaction d'annonces assistée.
