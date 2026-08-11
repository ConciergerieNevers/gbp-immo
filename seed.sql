-- ============================================================
--  GBP Immo — données de démonstration (secteur Nevers)
--  À lancer APRÈS schema.sql. Facultatif : sert à remplir la base
--  avec les mêmes biens/contacts que la démo pour tester en live.
-- ============================================================

insert into public.biens
  (reference, type, adresse, secteur, prix, surface, terrain, pieces, chambres, annee, dpe, garage, statut, proprietaire, nb_acquereurs, historique)
values
 ('GBP-2041','Maison','12 rue des Récollets','Nevers · centre',199000,127,680,5,4,1972,'D',true,'Exclusif','M. et Mme Delaunay',3,
   '[["Mandat exclusif signé","2 août 2026"],["Reportage photo réalisé","4 août 2026"],["Diffusion Leboncoin + SeLoger","5 août 2026"],["1re visite programmée","samedi 15 août"]]'),
 ('GBP-2033','Maison','34 rue de Charleville','Nevers · Banlay',189000,104,410,4,3,1985,'C',true,'Compromis','Succession Morel',0,
   '[["Mandat exclusif","12 mai 2026"],["Offre acceptée · 189 000 €","28 juil. 2026"],["Compromis signé","10 août 2026"]]'),
 ('GBP-2048','Appartement','Quai de Médine, T3','Nevers · bords de Loire',149000,68,0,3,2,2004,'C',true,'Exclusif','M. et Mme Ferrand',5,
   '[["Estimation réalisée","8 août 2026"],["Mandat exclusif signé","10 août 2026"]]'),
 ('GBP-2019','Appartement','7 rue du Commerce, T2','Nevers · centre',96000,44,0,2,1,1968,'E',false,'Simple','Mme Aubry',2,
   '[["Mandat simple","20 juin 2026"],["Baisse de prix -4 000 €","1 août 2026"]]'),
 ('GBP-2044','Maison','2 impasse des Vignes','Coulanges-lès-Nevers',264000,151,920,6,5,2011,'B',true,'Exclusif','M. Ollivier',4,
   '[["Estimation","15 juil. 2026"],["Mandat exclusif","22 juil. 2026"],["3 visites réalisées","août 2026"]]'),
 ('GBP-2027','Maison','18 avenue Colbert','Nevers · Saint-Genest',172000,96,520,4,3,1979,'D',true,'Simple','M. et Mme Renard',1,
   '[["Mandat simple","3 juil. 2026"],["1re visite","19 juil. 2026"]]'),
 ('GBP-2015','Appartement','5 place Carnot, T4','Nevers · centre',158000,88,0,4,3,1930,'C',false,'Compromis','M. Barbier',0,
   '[["Mandat exclusif","2 juin 2026"],["Compromis signé","5 août 2026"]]'),
 ('GBP-2039','Maison','9 chemin de Marzy','Marzy',229000,134,750,5,4,1998,'C',true,'Exclusif','Mme Dupuis',2,
   '[["Estimation","28 juin 2026"],["Mandat exclusif","5 juil. 2026"]]'),
 ('GBP-1998','Maison','22 rue Bovet','Nevers · Mouësse',118000,72,300,3,2,1962,'E',false,'Vendu','M. Girard',0,
   '[["Mandat simple","avr. 2026"],["Vente actée · 118 000 €","24 juil. 2026"]]');

insert into public.contacts (role, nom, detail, statut, budget, derniere_relance, prochaine_action, couleur) values
 ('vendeur','Delaunay','12 rue des Récollets','Exclusif',null,'il y a 3 j','Signature RDV jeudi','#6a9'),
 ('vendeur','Ferrand','Quai de Médine T3','Exclusif',null,'hier','Valider les photos','#7aa'),
 ('vendeur','Ollivier','2 impasse des Vignes','Exclusif',null,'il y a 5 j','Faire un retour visites','#b78'),
 ('vendeur','Renard','18 avenue Colbert','Simple',null,'il y a 8 j','Proposer l''exclusivité','#a86'),
 ('vendeur','Aubry','7 rue du Commerce','Simple',null,'il y a 12 j','Point sur baisse de prix','#699'),
 ('acquereur','Camille Petit','T3/T4 centre',null,160000,'hier','Envoyer 2 biens correspondants','#6a9'),
 ('acquereur','Thomas Girard','Maison ≤ 200 k€',null,200000,'il y a 2 j','Visite samedi 15/08','#7aa'),
 ('acquereur','Léa Fontaine','Locatif rentable',null,120000,'il y a 4 j','Relancer T2 rue Bovet','#b78'),
 ('acquereur','Hugo Blanc','Primo-accédant',null,140000,'il y a 6 j','Appeler courtier','#a86'),
 ('prospect','Famille Lambert','Estimation en ligne','Chaud',null,'il y a 1 j','Caler RDV estimation','#6a9'),
 ('prospect','M. Chevalier','Recommandation','Tiède',null,'il y a 3 j','Rappeler mardi','#7aa'),
 ('prospect','Mme Roy','Porte-à-porte','À qualifier',null,'il y a 7 j','Envoyer plaquette GBP','#b78'),
 ('prospect','SCI Vauban','Réseau','Chaud',null,'il y a 2 j','Proposer estimation loc.','#a86');
