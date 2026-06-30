/**
 * Import du catalogue interne producteur ("REF_PRODUIT") : familles + references.
 *
 * Format source : export tabulaire (tabulations), flexible 3 ou 4 colonnes :
 *   reference_produit \t [vide] \t famille_produit \t libelle_produit  (4 col)
 *   reference_produit \t famille_produit \t libelle_produit             (3 col)
 *
 * Usage : node src/import/import-ref-produits.js <chemin-vers-le-fichier>
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const knex = require('../db/knex');

function parserLignes(contenu) {
  const familles = new Map();
  const produits = [];

  const lignes = contenu.split(/\r?\n/);
  for (const ligneBrute of lignes) {
    if (ligneBrute.trim() === '') continue;

    const colonnes = ligneBrute.split('\t');
    const reference = (colonnes[0] || '').trim();

    // Cherche le premier champ entier pur -> code famille
    // Gere 3 colonnes (ref \t famille \t libelle)
    // et 4 colonnes (ref \t \t famille \t libelle)
    let familleCode = null;
    let familleIdx = -1;
    for (let i = 1; i < colonnes.length; i++) {
      const v = colonnes[i].trim();
      if (/^\d+$/.test(v)) {
        familleCode = parseInt(v, 10);
        familleIdx = i;
        break;
      }
    }
    if (familleCode === null || familleIdx === -1) continue;

    // Libelle = tout ce qui suit le code famille (peut etre en col suivante ou fusionné)
    const libelle = colonnes
      .slice(familleIdx + 1)
      .map(c => c.trim())
      .filter(Boolean)
      .join(' ')
      .trim();
    if (!libelle) continue;

    if (reference === '') {
      if (!familles.has(familleCode)) {
        familles.set(familleCode, libelle);
      }
    } else {
      produits.push({ codeInterne: reference, familleCode, libelle });
    }
  }

  return { familles, produits };
}

async function importerRefProduits(cheminFichier) {
  const contenu = fs.readFileSync(cheminFichier, { encoding: 'utf8' });
  const { familles, produits } = parserLignes(contenu);

  console.log(`${familles.size} famille(s) et ${produits.length} reference(s) produit detectees`);

  let famillesCreees = 0;
  for (const [code, libelle] of familles) {
    const existante = await knex('familles_produits').where({ code }).first();
    if (!existante) {
      await knex('familles_produits').insert({ code, libelle });
      famillesCreees += 1;
    } else if (existante.libelle !== libelle) {
      await knex('familles_produits').where({ code }).update({ libelle });
    }
  }

  let produitsCrees = 0;
  let produitsMisAJour = 0;
  const doublonsCode = [];
  const codesVus = new Map();

  for (const { codeInterne, familleCode, libelle } of produits) {
    if (codesVus.has(codeInterne) && codesVus.get(codeInterne) !== libelle) {
      doublonsCode.push(
        `${codeInterne} : "${codesVus.get(codeInterne)}" vs "${libelle}"`
      );
    }
    codesVus.set(codeInterne, libelle);

    if (!familles.has(familleCode)) {
      const existanteFamille = await knex('familles_produits').where({ code: familleCode }).first();
      if (!existanteFamille) {
        await knex('familles_produits').insert({ code: familleCode, libelle: `Famille ${familleCode}` });
      }
      familles.set(familleCode, `Famille ${familleCode}`);
    }

    const existant = await knex('ref_produits_internes').where({ code_interne: codeInterne }).first();
    if (!existant) {
      await knex('ref_produits_internes').insert({
        code_interne: codeInterne,
        famille_code: familleCode,
        libelle_produit: libelle,
      });
      produitsCrees += 1;
    } else if (existant.libelle_produit !== libelle || existant.famille_code !== familleCode) {
      await knex('ref_produits_internes').where({ code_interne: codeInterne }).update({
        famille_code: familleCode,
        libelle_produit: libelle,
      });
      produitsMisAJour += 1;
    }
  }

  console.log(`\nFamilles : ${famillesCreees} creees / ${familles.size} au total`);
  console.log(
    `References produit : ${produitsCrees} creees, ${produitsMisAJour} mises a jour, ${produits.length} traitees au total`
  );

  if (doublonsCode.length > 0) {
    console.log(`\n⚠ ${doublonsCode.length} code(s) avec des libelles differents dans le fichier source :`);
    doublonsCode.forEach((d) => console.log(`  - ${d}`));
  }
}

if (require.main === module) {
  const cheminArg = process.argv[2];
  if (!cheminArg) {
    console.error('Usage : node src/import/import-ref-produits.js <chemin-vers-le-fichier>');
    process.exit(1);
  }
  importerRefProduits(path.resolve(cheminArg))
    .then(() => knex.destroy())
    .catch((err) => {
      console.error('Erreur import :', err);
      knex.destroy();
      process.exit(1);
    });
}

module.exports = { importerRefProduits, parserLignes };
