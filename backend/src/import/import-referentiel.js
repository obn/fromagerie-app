/**
 * Import du référentiel produits (fichier "REFERENCES_PRODUITS") en base.
 *
 * Colonnes du CSV (sans en-tête de 1ere colonne) :
 *   client, gencod, designation, pcb, poids, tarif_general, remise, tarif_net, unite, dluo
 *
 * Particularités gérées :
 *  - nombres en virgule francaise ("12,5" -> 12.5)
 *  - remise tantot en pourcentage explicite ("18,80%"), tantot en decimal brut ("0,02" = 2%)
 *  - DLUO du type "30J" / "45j" -> on garde juste le nombre de jours
 *  - noms de client avec espaces parasites ("DISTRAL ", " LAITERIE DU MONT AIGUILLE")
 *  - un meme gencod peut apparaitre avec une designation differente selon les lignes
 *    (erreur de saisie historique côté fournisseur) -> on log un avertissement plutot
 *    que d'ecraser silencieusement, pour que ce soit verifie a la main.
 *
 * Usage : node src/import/import-referentiel.js <chemin-vers-le-csv>
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const knex = require('../db/knex');

function parseNombreFr(valeur) {
  if (valeur === undefined || valeur === null) return null;
  const nettoye = String(valeur).trim();
  if (nettoye === '') return null;
  const normalise = nettoye.replace(/\s/g, '').replace(',', '.');
  const nombre = parseFloat(normalise);
  return Number.isNaN(nombre) ? null : nombre;
}

function parseRemisePct(valeur) {
  if (valeur === undefined || valeur === null) return null;
  const nettoye = String(valeur).trim();
  if (nettoye === '') return null;
  if (nettoye.includes('%')) {
    return parseNombreFr(nettoye.replace('%', ''));
  }
  // format brut type "0,02" = 2%
  const decimal = parseNombreFr(nettoye);
  return decimal === null ? null : Math.round(decimal * 10000) / 100;
}

function parseDluoJours(valeur) {
  if (!valeur) return null;
  const match = String(valeur).match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

function normaliserUnite(valeur) {
  if (!valeur) return null;
  const v = valeur.trim().toLowerCase();
  if (v === 'kg') return 'Kg';
  if (v === 'pièce' || v === 'piece') return 'Pièce';
  return valeur.trim();
}

async function getOrCreateClient(nomBrut, cache) {
  const nom = nomBrut.trim();
  if (cache.has(nom)) return cache.get(nom);

  let client = await knex('clients').where({ nom }).first();
  if (!client) {
    const [id] = await knex('clients').insert({ nom });
    client = { id, nom };
    console.log(`  + nouveau client : ${nom}`);
  }
  cache.set(nom, client.id);
  return client.id;
}

async function getOrCreateProduit(gencod, designation, unite, dluoJours, cache, avertissements) {
  if (cache.has(gencod)) {
    const existant = cache.get(gencod);
    if (existant.designation !== designation) {
      avertissements.push(
        `gencod ${gencod} a deux designations differentes : "${existant.designation}" / "${designation}" — a verifier manuellement`
      );
    }
    return existant.id;
  }

  let produit = await knex('produits').where({ gencod }).first();
  if (!produit) {
    const [id] = await knex('produits').insert({ gencod, designation, unite, dluo_jours: dluoJours });
    produit = { id, designation };
    console.log(`  + nouveau produit : ${gencod} — ${designation}`);
  } else if (produit.designation !== designation) {
    avertissements.push(
      `gencod ${gencod} : designation en base ("${produit.designation}") differe du CSV ("${designation}") — designation en base conservee, a verifier manuellement`
    );
  }
  cache.set(gencod, { id: produit.id, designation: produit.designation || designation });
  return produit.id;
}

async function upsertTarif(clientId, produitId, ligne) {
  const valeurs = {
    pcb: parseNombreFr(ligne.pcb) !== null ? Math.round(parseNombreFr(ligne.pcb)) : null,
    poids: parseNombreFr(ligne.poids),
    tarif_general: parseNombreFr(ligne.tarif_general),
    remise_pct: parseRemisePct(ligne.remise),
    tarif_net: parseNombreFr(ligne.tarif_net),
    unite_facturation: normaliserUnite(ligne.unite),
  };

  const existant = await knex('tarifs_client_produit')
    .where({ client_id: clientId, produit_id: produitId })
    .first();

  if (existant) {
    await knex('tarifs_client_produit').where({ id: existant.id }).update(valeurs);
  } else {
    await knex('tarifs_client_produit').insert({ client_id: clientId, produit_id: produitId, ...valeurs });
  }
}

async function importerReferentiel(cheminCsv) {
  const contenu = fs.readFileSync(cheminCsv, { encoding: 'utf8' });
  const lignes = parse(contenu, { columns: false, skip_empty_lines: true, from_line: 2 });

  console.log(`${lignes.length} lignes a traiter depuis ${path.basename(cheminCsv)}`);

  const cacheClients = new Map();
  const cacheProduits = new Map();
  const avertissements = [];
  let traitees = 0;
  let ignorees = 0;

  for (const colonnes of lignes) {
    const [clientBrut, gencod, designationBrute, pcb, poids, tarifGeneral, remise, tarifNet, unite, dluo] = colonnes;

    if (!clientBrut || !gencod || !designationBrute) {
      ignorees += 1;
      continue;
    }

    const designation = designationBrute.trim();
    const uniteNormalisee = normaliserUnite(unite);
    const dluoJours = parseDluoJours(dluo);

    const clientId = await getOrCreateClient(clientBrut, cacheClients);
    const produitId = await getOrCreateProduit(
      gencod.trim(),
      designation,
      uniteNormalisee,
      dluoJours,
      cacheProduits,
      avertissements
    );
    await upsertTarif(clientId, produitId, { pcb, poids, tarif_general: tarifGeneral, remise, tarif_net: tarifNet, unite });

    traitees += 1;
  }

  console.log(`\nTermine : ${traitees} lignes importees, ${ignorees} lignes ignorees (incompletes).`);
  console.log(`Clients : ${cacheClients.size} — Produits distincts : ${cacheProduits.size}`);

  if (avertissements.length > 0) {
    console.log(`\n⚠ ${avertissements.length} avertissement(s) a verifier manuellement :`);
    avertissements.forEach((a) => console.log(`  - ${a}`));
  }
}

if (require.main === module) {
  const cheminArg = process.argv[2];
  if (!cheminArg) {
    console.error('Usage : node src/import/import-referentiel.js <chemin-vers-le-csv>');
    process.exit(1);
  }
  importerReferentiel(path.resolve(cheminArg))
    .then(() => knex.destroy())
    .catch((err) => {
      console.error('Erreur import :', err);
      knex.destroy();
      process.exit(1);
    });
}

module.exports = { importerReferentiel, parseNombreFr, parseRemisePct, parseDluoJours, normaliserUnite };
