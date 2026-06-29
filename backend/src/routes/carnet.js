const express = require('express');
const knex = require('../db/knex');

const router = express.Router();

// GET /api/carnet/:annee/:mois/:jour
// Reconstruit la structure attendue par CarnetCommandes.vue : groupe par client.
router.get('/:annee/:mois/:jour', async (req, res) => {
  try {
    const { annee, mois, jour } = req.params;
    const date = `${annee}-${mois}-${jour}`;

    const commandes = await knex('commandes')
      .join('clients', 'clients.id', 'commandes.client_id')
      .where('commandes.date_livraison', date)
      .select('commandes.*', 'clients.nom as client_nom');

    const result = [];
    for (const commande of commandes) {
      const lignes = await knex('lignes_commande').where({ commande_id: commande.id });
      result.push({ ...commande, lignes });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/carnet/:annee/:mois/:jour
// Body attendu : { [ligneId]: { fait, dlc, lot, produit, codeInterne } }
// (equivalent du saveState() de la page HTML, mais ecrit en base au lieu d'un fichier JSON)
router.post('/:annee/:mois/:jour', async (req, res) => {
  try {
    const etat = req.body;
    const updates = Object.entries(etat).map(([ligneId, valeurs]) =>
      knex('lignes_commande')
        .where({ id: ligneId })
        .update({
          fait: !!valeurs.fait,
          dlc: valeurs.dlc || null,
          numero_lot: valeurs.lot || null,
          designation_brute: valeurs.produit,
          code_interne: valeurs.codeInterne,
          fait_le: valeurs.fait ? knex.fn.now() : null,
        })
    );
    await Promise.all(updates);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
