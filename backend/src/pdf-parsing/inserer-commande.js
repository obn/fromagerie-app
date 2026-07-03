/**
 * Insère en base une commande parsée par les parsers PDF.
 * - Résout le client via son nom (colonne clients.nom)
 * - Evite les doublons via (client_id, numero_commande)
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

async function insererCommande(commande, options = {}) {
  const { gmailMessageId = null, fichierPdfUrl = null } = options;

  if (!commande.client) {
    throw new Error('Client non identifié dans le PDF — insertion impossible');
  }

  // ── Résolution du client ──────────────────────────────────────────────────
  const client = await knex('clients')
    .whereRaw('LOWER(nom) = ?', [commande.client.toLowerCase()])
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
    statut:                   'a_verifier',
    source:                   'gmail',
    gmail_message_id:         gmailMessageId,
    fichier_pdf_url:          fichierPdfUrl,
  });

  // ── Insertion lignes ──────────────────────────────────────────────────────
  let nbResolues = 0;

  for (const ligne of commande.lignes || []) {
    let produitId = null;
    if (ligne.codeInterne) {
      const ci = await knex('codes_internes')
        .where({ client_id: client.id, code_interne: ligne.codeInterne })
        .first();
      if (ci?.produit_id) { produitId = ci.produit_id; nbResolues++; }
    }
    if (!produitId && ligne.gencod) {
      const p = await knex('produits').where({ gencod: ligne.gencod }).first();
      if (p) { produitId = p.id; nbResolues++; }
    }

    await knex('lignes_commande').insert({
      commande_id:       commandeId,
      code_interne:      ligne.codeInterne      || null,
      produit_id:        produitId,
      designation_brute: ligne.designationBrute || null,
      quantite:          ligne.quantite          || null,
      unite:             ligne.unite             || null,
      certitude:         ligne.certitude         || 'a_verifier',
      ligne_brute:       ligne.ligneBrute        || null,
    });
  }

  console.log(
    `[import] Commande ${commande.numeroCommande} (${commande.client}) insérée — ` +
    `livraison calculée : ${dateLivraisonCalculee || 'non déterminée'} — ` +
    `${commande.lignes.length} ligne(s), ${nbResolues} résolu(s) automatiquement`
  );

  return { doublon: false, commandeId, nbLignes: commande.lignes.length, nbResolues, dateLivraisonCalculee };
}

module.exports = { insererCommande, calculerDateLivraison };