# Fromagerie App — Backend (schéma DB)

## Installation

```bash
npm install
cp .env.example .env
# Renseigner MYSQL_URL (copié depuis Railway > service MySQL > Variables)
npm run migrate
npm run seed
```

## Schéma

```
clients ──┬──< tarifs_client_produit >──┬── produits
          ├──< codes_internes ──────────┘
          └──< commandes ──< lignes_commande >── produits (nullable)

parametres (table générique clé/valeur, indépendante)
```

### Pourquoi ce découpage

- **produits** : référentiel unique par `gencod` (le code barre), indépendant du client.
- **tarifs_client_produit** : chaque client (DISTRAL, SCAPALYON, PERRET...) a sa propre
  remise/tarif net sur un même produit — c'est la grille tarifaire extraite du CSV.
- **codes_internes** : fait le pont entre le code utilisé par un client dans ses commandes
  (ex: `FBE09`) et le `gencod` du référentiel. `produit_id` reste `NULL` jusqu'à validation
  manuelle — utile pour les nouveaux codes jamais vus.
- **commandes** : une ligne par bon de commande (numéro + client), avec un statut
  (`brouillon` / `a_verifier` / `validee` / `archivee`) et une trace de l'origine
  (`source`: gmail ou manuel, + `gmail_message_id` pour éviter les doublons si le même mail
  est relu).
- **lignes_commande** : le détail produit/quantité. Le champ `certitude` reprend directement
  la logique de ton pipeline de parsing (`haute` / `a_verifier` / `non_fiable`), et
  `ligne_brute` conserve le texte brut quand le PDF a un chevauchement de texte — ça permet
  de construire un écran de "lignes à valider manuellement" sans perdre l'info source.

### Historisation par année/mois/jour

Pas de colonnes `annee`/`mois`/`jour` dédiées : `date_commande` et `date_livraison` sont
indexées, donc des requêtes du type :

```sql
SELECT * FROM commandes WHERE YEAR(date_livraison) = 2026 AND MONTH(date_livraison) = 6;
```

restent performantes. Si le volume grossit beaucoup, on pourra ajouter des colonnes
générées (`STORED GENERATED`) le jour où c'est nécessaire — pas besoin d'anticiper.

## Prochaines briques (pas encore faites)

1. Script d'import du référentiel CSV → tables `produits` + `tarifs_client_produit`
2. Module Gmail (récupération des mails du label "commandes validées")
3. API Express (routes CRUD) + frontend Vue.js
