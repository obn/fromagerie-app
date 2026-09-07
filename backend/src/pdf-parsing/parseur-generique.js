/**
 * Moteur de parsing generique : applique les regex stockees en base
 * (table parseurs_fournisseurs) pour extraire une commande depuis un texte
 * de PDF, sans avoir a ecrire une fonction JS dediee par fournisseur.
 *
 * Complementaire aux parsers JS "historiques" (parsers.js) reserves aux
 * formats trop complexes pour etre exprimes en simples regex (multi-lignes
 * imbriquees comme Distral).
 */

const knex = require('../db/knex');

function parseQte(s) {
  if (s === undefined || s === null) return null;
  const n = parseFloat(String(s).replace(',', '.'));
  return isNaN(n) ? null : n;
}

function parseDateAvecFormat(dateStr, formatAnnee) {
  if (!dateStr) return null;
  const m = dateStr.match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (!m) return null;
  const [, j, mo, a] = m;
  const annee = formatAnnee === '2_chiffres' && a.length === 2 ? '20' + a : a;
  return `${annee}-${mo.padStart(2, '0')}-${j.padStart(2, '0')}`;
}

/**
 * Recupere tous les parseurs actifs, en cache le temps du process (rafraichi
 * a chaque appel de syncGmail typiquement, pas besoin de cache long).
 */
async function chargerParseursActifs() {
  return knex('parseurs_fournisseurs').where({ actif: true });
}

/**
 * Cherche un parseur configure dont les mots-cles de detection matchent
 * le texte du PDF ou le nom du fichier.
 */
function trouverParseurCorrespondant(texte, nomFichier, parseurs) {
  const t = (texte || '').toLowerCase();
  const f = (nomFichier || '').toLowerCase();

  for (const p of parseurs) {
    const mots = p.mots_cles_detection.split(',').map(m => m.trim().toLowerCase()).filter(Boolean);
    if (mots.some(mot => t.includes(mot) || f.includes(mot))) {
      return p;
    }
  }
  return null;
}

/**
 * Compile une regex stockee en base (chaine texte) en objet RegExp JS.
 * Les flags 'gm' sont ajoutes automatiquement pour les regex de ligne produit
 * (recherche globale multi-lignes), pas pour les regex ponctuelles (numero,
 * dates) qui n'ont besoin que du premier match.
 */
function compilerRegex(pattern, global = false) {
  try {
    return new RegExp(pattern, global ? 'gm' : '');
  } catch (e) {
    throw new Error(`Regex invalide en base : "${pattern}" — ${e.message}`);
  }
}

/**
 * Applique un parseur configure (issu de la table parseurs_fournisseurs)
 * a un texte de PDF, et retourne la commande extraite au meme format que
 * les parsers JS historiques (parsers.js).
 */
function appliquerParseurConfigure(texte, parseur) {
  const lignes = [];

  const regNumero = compilerRegex(parseur.regex_numero_commande);
  const mNumero = texte.match(regNumero);
  const numeroCommande = mNumero ? (mNumero[1] || mNumero[0]) : 'INCONNU';

  let dateCommande = null;
  if (parseur.regex_date_commande) {
    const mDate = texte.match(compilerRegex(parseur.regex_date_commande));
    dateCommande = parseDateAvecFormat(mDate?.[1], parseur.format_annee);
  }

  let dateLivraison = null;
  if (parseur.regex_date_livraison) {
    const mDate = texte.match(compilerRegex(parseur.regex_date_livraison));
    dateLivraison = parseDateAvecFormat(mDate?.[1], parseur.format_annee);
  }

  const regLigne = compilerRegex(parseur.regex_ligne_produit, true);
  let m;
  while ((m = regLigne.exec(texte)) !== null) {
    // Convention : groupe 1 = code interne, groupe 2 = designation,
    // groupe 3 = quantite, groupe 4 = DLC (optionnelle, ignoree pour l'instant
    // au-dela de marquer la fin de ligne).
    const codeInterne = m[1]?.trim() || null;
    const designation = m[2]?.trim() || null;
    const quantite = parseQte(m[3]);

    if (!designation) continue;

    lignes.push({
      codeInterne,
      gencod: null,
      designationBrute: designation,
      quantite,
      unite: null,
      certitude: 'a_verifier', // parsing base de donnees encore jeune -> prudence par defaut
      ligneBrute: m[0].trim(),
    });
  }

  if (lignes.length === 0) {
    console.warn(`[parseur configure] "${parseur.nom_fournisseur}" — aucune ligne reconnue avec la regex stockee. A ajuster.`);
  }

  return {
    client: parseur.nom_fournisseur,
    numeroCommande,
    dateCommande,
    dateLivraison,
    lignes,
  };
}

module.exports = {
  chargerParseursActifs,
  trouverParseurCorrespondant,
  appliquerParseurConfigure,
};
