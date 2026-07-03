/**
 * Insère en base une commande parsée par les parsers PDF.
 * - Résout le client via son nom (colonne clients.nom)
 * - Evite les doublons via (client_id, numero_commande)
 * - Résout produit_id via codes_internes si disponible
 */

const knex = require('../db/knex');

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

  // ── Insertion commande ────────────────────────────────────────────────────
  const [commandeId] = await knex('commandes').insert({
    numero_commande:       commande.numeroCommande,
    client_id:             client.id,
    date_commande:         commande.dateCommande   || null,
    date_livraison:        commande.dateLivraison  || null,
    date_livraison_pdf_brute: commande.dateLivraisonBrute || null,
    statut:                'a_verifier',
    source:                'gmail',
    gmail_message_id:      gmailMessageId,
    fichier_pdf_url:       fichierPdfUrl,
  });

  // ── Insertion lignes ──────────────────────────────────────────────────────
  let nbResolues = 0;

  for (const ligne of commande.lignes || []) {
    // Tentative de résolution via codes_internes
    let produitId = null;
    if (ligne.codeInterne) {
      const ci = await knex('codes_internes')
        .where({ client_id: client.id, code_interne: ligne.codeInterne })
        .first();
      if (ci?.produit_id) { produitId = ci.produit_id; nbResolues++; }
    }
    // Si gencod direct → résolution par gencod
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
    `${commande.lignes.length} ligne(s), ${nbResolues} résolu(s) automatiquement`
  );

  return { doublon: false, commandeId, nbLignes: commande.lignes.length, nbResolues };
}

module.exports = { insererCommande };
