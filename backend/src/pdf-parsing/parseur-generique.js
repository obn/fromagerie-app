/**
 * Moteur de parsing generique : applique les regex stockees en base
 * (table parseurs_fournisseurs) pour extraire une commande depuis un texte
 * de PDF, sans avoir a ecrire une fonction JS dediee par fournisseur.
 *
 * Complementaire aux parsers JS "historiques" (parsers.js) reserves aux
 * formats trop complexes pour etre exprimes en simples regex (multi-lignes
 * imbriquees comme Distral).
 *
 * IMPORTANT — groupes nommes recommandes pour regex_ligne_produit :
 * pdf-parse peut extraire les colonnes d'un PDF dans un ORDRE DIFFERENT de
 * l'ordre visuel (ex: designation en fin de "ligne" au lieu du debut, comme
 * observe avec Disprodal). Pour rester robuste quel que soit cet ordre,
 * utilise des groupes nommes dans regex_ligne_produit :
 *   (?<code>...)  (?<designation>...)  (?<quantite>...)  (?<dlc>...)
 * Le moteur les detecte automatiquement (fallback sur position 1/2/3/4
 * si aucun groupe nomme n'est utilise, pour compatibilite ascendante).
 *
 * RESOLUTION DYNAMIQUE DU CLIENT (regex_client_nom) :
 * Certains fournisseurs utilisent UN MEME template PDF pour plusieurs clients
 * distincts (ex: reseau de magasins), le client reel etant indique DANS le
 * PDF plutot que fixe par config. Quand regex_client_nom est renseignee, le
 * moteur extrait ce texte puis cherche le client correspondant en base par
 * rapprochement de libelle (meme logique que la resolution des codes
 * produits par libelle dans inserer-commande.js).
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

async function chargerParseursActifs() {
  return knex('parseurs_fournisseurs').where({ actif: true });
}

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

function compilerRegex(pattern, global = false) {
  try {
    return new RegExp(pattern, global ? 'gm' : '');
  } catch (e) {
    throw new Error(`Regex invalide en base : "${pattern}" — ${e.message}`);
  }
}

// ── Rapprochement de libelle (client OU produit) — meme logique que ────────
// trouverCodeParLibelle dans inserer-commande.js, dupliquee ici en version
// generique pour eviter une dependance circulaire entre modules.
function normaliser(s) {
  return (s || '')
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const MOTS_VIDES_CLIENT = new Set(['DE', 'DU', 'DES', 'LA', 'LE', 'LES', 'ET', 'A', 'AU', 'AUX', 'EN']);

function tokeniserClient(s) {
  return normaliser(s)
    .split(/[^A-Z0-9]+/)
    .filter(t => t.length >= 2 && !MOTS_VIDES_CLIENT.has(t))
    .map(t => t.replace(/S$/, '')); // dé-pluralise grossièrement (BOUCHERIES -> BOUCHERIE)
}

/**
 * Cherche en base le client dont le nom correspond le mieux au texte extrait
 * du PDF (ex: "TIGNIEU - BOUCHERIES ANDRE" -> "Boucherie André Tignieu").
 * Retourne le nom EXACT stocke en base (clients.nom) si trouve, sinon le
 * texte brut extrait tel quel (l'insertion echouera alors proprement avec
 * un message "client introuvable", visible dans les logs pour ajout manuel).
 */
async function resoudreClientParLibelle(texteExtrait) {
  const tokensExtrait = new Set(tokeniserClient(texteExtrait));
  if (tokensExtrait.size === 0) return texteExtrait;

  const clients = await knex('clients').select('nom');

  let meilleur = null;
  let meilleurScore = 0;

  for (const c of clients) {
    const tokensClient = tokeniserClient(c.nom);
    if (tokensClient.length === 0) continue;

    const communs = tokensClient.filter(t => tokensExtrait.has(t));
    if (communs.length === 0) continue;

    const scoreRecouvrement = communs.length / Math.min(tokensExtrait.size, tokensClient.length);
    if (scoreRecouvrement < 0.5) continue;

    const score = scoreRecouvrement * 100 + communs.length;
    if (score > meilleurScore) {
      meilleurScore = score;
      meilleur = c.nom;
    }
  }

  if (!meilleur) {
    console.warn(`[parseur configure] Client non reconnu pour le texte extrait "${texteExtrait}" — verifier qu'il existe bien dans Referentiels > Clients.`);
  }

  return meilleur || texteExtrait;
}

function extraireChampsMatch(m) {
  if (m.groups && (m.groups.code || m.groups.designation || m.groups.quantite)) {
    return {
      codeInterne: m.groups.code?.trim() || null,
      designation: m.groups.designation?.trim() || null,
      quantite: parseQte(m.groups.quantite),
    };
  }
  return {
    codeInterne: m[1]?.trim() || null,
    designation: m[2]?.trim() || null,
    quantite: parseQte(m[3]),
  };
}

async function appliquerParseurConfigure(texte, parseur) {
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

  // Resolution du client : dynamique (extrait du PDF) ou fixe (nom_fournisseur)
  let client = parseur.nom_fournisseur;
  if (parseur.regex_client_nom) {
    const mClient = texte.match(compilerRegex(parseur.regex_client_nom));
    const texteExtrait = mClient?.[1]?.trim();
    if (texteExtrait) {
      client = await resoudreClientParLibelle(texteExtrait);
    } else {
      console.warn(`[parseur configure] "${parseur.nom_fournisseur}" — regex_client_nom n'a rien capture, verifier le format.`);
    }
  }

  const regLigne = compilerRegex(parseur.regex_ligne_produit, true);
  let m;
  while ((m = regLigne.exec(texte)) !== null) {
    const { codeInterne, designation, quantite } = extraireChampsMatch(m);

    if (!designation) continue;

    lignes.push({
      codeInterne,
      gencod: null,
      designationBrute: designation,
      quantite,
      unite: null,
      certitude: 'a_verifier',
      ligneBrute: m[0].trim(),
    });
  }

  if (lignes.length === 0) {
    console.warn(`[parseur configure] "${parseur.nom_fournisseur}" — aucune ligne reconnue avec la regex stockee. A ajuster.`);
  }

  return { client, numeroCommande, dateCommande, dateLivraison, lignes };
}

module.exports = {
  chargerParseursActifs,
  trouverParseurCorrespondant,
  appliquerParseurConfigure,
};
