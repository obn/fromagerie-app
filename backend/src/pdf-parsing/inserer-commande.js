/**
 * Insère en base une commande parsée par les parsers PDF.
 * - Résout le client via son nom (colonne clients.nom)
 * - Evite les doublons via (client_id, numero_commande)
 * - Résout le code interne par libellé si absent du PDF (rapprochement texte
 *   contre le catalogue interne ref_produits_internes)
 * - Résout produit_id via codes_internes si disponible
 * - Calcule la date de livraison réelle à partir du jour fixe du client
 *   (clients.jour_fixe_livraison), PAS depuis la date lue dans le PDF —
 *   celle-ci est souvent absente, mal formatée ou non fiable selon les
 *   fournisseurs.
 */

const knex = require('../db/knex');

const JOURS_SEMAINE = {
  dimanche: 0, lundi: 1, mardi: 2, mercredi: 3,
  jeudi: 4, vendredi: 5, samedi: 6,
};

/**
 * Calcule la prochaine date (>= dateAncrage) tombant sur le jour de la
 * semaine demandé. Si dateAncrage tombe déjà sur ce jour, elle est
 * retournée telle quelle.
 *
 * @param {string} dateAncrage - 'YYYY-MM-DD', date de départ du calcul (typiquement date_commande)
 * @param {string} jourFixeLivraison - ex: 'jeudi' (insensible à la casse)
 * @returns {string|null} 'YYYY-MM-DD' ou null si jourFixeLivraison invalide
 */
function calculerDateLivraison(dateAncrage, jourFixeLivraison) {
  if (!jourFixeLivraison) return null;

  const jourCible = JOURS_SEMAINE[jourFixeLivraison.trim().toLowerCase()];
  if (jourCible === undefined) {
    console.warn(`[date_livraison] Jour fixe non reconnu : "${jourFixeLivraison}"`);
    return null;
  }

  const base = dateAncrage ? new Date(dateAncrage + 'T12:00:00') : new Date();
  const jourActuel = base.getDay();
  let decalage = (jourCible - jourActuel + 7) % 7;

  const resultat = new Date(base);
  resultat.setDate(resultat.getDate() + decalage);

  return resultat.toISOString().slice(0, 10);
}

/**
 * Normalise un libellé pour comparaison texte : majuscules, sans accents,
 * espaces multiples réduits à un seul, sans espaces de bord.
 */
function normaliser(s) {
  return (s || '')
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // retire les accents
    .replace(/\s+/g, ' ')
    .trim();
}

// Mots trop generiques pour compter dans la comparaison (bruit, pas de valeur discriminante)
const MOTS_VIDES = new Set([
  'DE', 'DU', 'DES', 'LA', 'LE', 'LES', 'ET', 'A', 'AU', 'AUX', 'EN',
  'KG', 'GR', 'G', 'PC', 'PCB', 'X', 'ENVIRON', 'CARTON', 'VRAC',
]);

function tokeniser(s) {
  return normaliser(s)
    .split(/[^A-Z0-9]+/)
    .filter(t => t.length >= 2 && !MOTS_VIDES.has(t));
}

/**
 * Cherche dans le catalogue interne (ref_produits_internes) le code dont le
 * libellé correspond le mieux à la désignation fournie par le PDF.
 *
 * Stratégie en 2 temps :
 *  1. Correspondance exacte (normalisée) — confiance haute
 *  2. Similarité par tokens communs (mots significatifs partagés, hors mots
 *     vides comme "DE"/"KG"/"CARTON") — tolère un ordre des mots different,
 *     des mots en plus ("SEAU", "ABBAYE DES DOMBES") ou des abreviations
 *     d'unite legerement differentes. Confiance partielle, exigee a au moins
 *     2 mots significatifs communs et 60% de recouvrement du plus petit set.
 *
 * @param {string} designation - texte brut du PDF
 * @param {Array<{code_interne: string, libelle_produit: string}>} catalogue
 * @returns {{code: string, confiance: 'exacte'|'partielle'} | null}
 */
function trouverCodeParLibelle(designation, catalogue) {
  const d = normaliser(designation);
  if (!d) return null;

  const exact = catalogue.find(r => normaliser(r.libelle_produit) === d);
  if (exact) return { code: exact.code_interne, confiance: 'exacte' };

  const tokensDesignation = new Set(tokeniser(designation));
  if (tokensDesignation.size === 0) return null;

  let meilleur = null;
  let meilleurScore = 0;

  for (const r of catalogue) {
    const tokensLibelle = tokeniser(r.libelle_produit);
    if (tokensLibelle.length === 0) continue;

    const communs = tokensLibelle.filter(t => tokensDesignation.has(t));
    if (communs.length < 2) continue; // au moins 2 mots significatifs communs

    const scoreRecouvrement = communs.length / Math.min(tokensDesignation.size, tokensLibelle.length);
    if (scoreRecouvrement < 0.6) continue; // au moins 60% de recouvrement du plus petit ensemble

    // Score global : privilegie le meilleur recouvrement, puis le plus de mots communs
    const score = scoreRecouvrement * 100 + communs.length;
    if (score > meilleurScore) {
      meilleurScore = score;
      meilleur = r;
    }
  }

  return meilleur ? { code: meilleur.code_interne, confiance: 'partielle' } : null;
}

async function insererCommande(commande, options = {}) {
  const { gmailMessageId = null, fichierPdfUrl = null, dateReceptionMail = null } = options;

  if (!commande.client) {
    throw new Error('Client non identifié dans le PDF — insertion impossible');
  }

  // ── Résolution du client ──────────────────────────────────────────────────
  const client = await knex('clients')
    .where(function () {
      this.whereRaw('LOWER(nom) = ?', [commande.client.toLowerCase()])
        .orWhereRaw('LOWER(nom_facture) = ?', [commande.client.toLowerCase()]);
    })
    .first();

  if (!client) {
    throw new Error(`Client "${commande.client}" introuvable en base — vérifier la table clients`);
  }

  // ── Vérification doublon ──────────────────────────────────────────────────
  const existante = await knex('commandes')
    .where({ client_id: client.id, numero_commande: commande.numeroCommande })
    .first();

  if (existante) {
    console.log(`[import] Commande ${commande.numeroCommande} (${commande.client}) déjà en base — ignorée`);
    return { doublon: true, commandeId: existante.id };
  }

  // ── Calcul de la date de livraison réelle ─────────────────────────────────
  // On ignore volontairement commande.dateLivraison (lue dans le PDF, non fiable) :
  // la vraie date de livraison est déterminée par le jour fixe du client.
  const dateLivraisonCalculee = calculerDateLivraison(commande.dateCommande, client.jour_fixe_livraison);

  if (!dateLivraisonCalculee) {
    console.warn(
      `[import] Aucun jour fixe de livraison configuré pour "${client.nom}" — ` +
      `date_livraison laissée vide, à renseigner manuellement`
    );
  }

  // ── Insertion commande ────────────────────────────────────────────────────
  const [commandeId] = await knex('commandes').insert({
    numero_commande:          commande.numeroCommande,
    client_id:                client.id,
    date_commande:            commande.dateCommande       || null,
    date_livraison:           dateLivraisonCalculee        || null,
    date_livraison_pdf_brute: commande.dateLivraison       || null, // conservée pour trace/audit
    date_reception_mail:      dateReceptionMail            || null,
    statut:                   'a_verifier',
    source:                   'gmail',
    gmail_message_id:         gmailMessageId,
    fichier_pdf_url:          fichierPdfUrl,
  });

  if (dateLivraisonCalculee) {
    await knex('livraisons').insert({
      commande_id: commandeId,
      date_livraison: dateLivraisonCalculee,
      statut: 'prevue',
    });
  }

  // ── Chargement du catalogue interne une seule fois (table restreinte) ─────
  // Utilisé pour deduire le code_interne quand le PDF n'en fournit aucun.
  const catalogueInterne = await knex('ref_produits_internes').select('code_interne', 'libelle_produit');

  // ── Insertion lignes ──────────────────────────────────────────────────────
  let nbResolues = 0;
  let nbDeduitsParLibelle = 0;

  for (const ligne of commande.lignes || []) {
    let codeInterne = ligne.codeInterne || null;
    let certitude = ligne.certitude || 'a_verifier';

    // Deduction du code interne par rapprochement texte si absent du PDF
    if (!codeInterne && !ligne.gencod && ligne.designationBrute) {
      const trouve = trouverCodeParLibelle(ligne.designationBrute, catalogueInterne);
      if (trouve) {
        codeInterne = trouve.code;
        nbDeduitsParLibelle++;
        // Une deduction reste une supposition : on ne remonte jamais la certitude
        // au-dessus de "a_verifier", meme si le texte matchait exactement.
        if (certitude === 'haute') certitude = 'a_verifier';
      }
    }

    let produitId = null;
    if (codeInterne) {
      const ci = await knex('codes_internes')
        .where({ client_id: client.id, code_interne: codeInterne })
        .first();
      if (ci?.produit_id) { produitId = ci.produit_id; nbResolues++; }
    }
    if (!produitId && ligne.gencod) {
      const p = await knex('produits').where({ gencod: ligne.gencod }).first();
      if (p) { produitId = p.id; nbResolues++; }
    }

    await knex('lignes_commande').insert({
      commande_id:       commandeId,
      code_interne:      codeInterne             || null,
      produit_id:        produitId,
      designation_brute: ligne.designationBrute  || null,
      quantite:          ligne.quantite           || null,
      unite:             ligne.unite              || null,
      certitude,
      ligne_brute:       ligne.ligneBrute         || null,
    });
  }

  console.log(
    `[import] Commande ${commande.numeroCommande} (${commande.client}) insérée — ` +
    `livraison calculée : ${dateLivraisonCalculee || 'non déterminée'} — ` +
    `${commande.lignes.length} ligne(s), ${nbResolues} résolu(s), ${nbDeduitsParLibelle} code(s) déduit(s) par libellé`
  );

  return {
    doublon: false, commandeId,
    nbLignes: commande.lignes.length,
    nbResolues, nbDeduitsParLibelle,
    dateLivraisonCalculee,
  };
}

module.exports = { insererCommande, calculerDateLivraison, trouverCodeParLibelle, normaliser };