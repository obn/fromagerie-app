const express = require('express');
const knex = require('../db/knex');

const router = express.Router();

// GET /api/carnet/:annee/:mois/:jour
// Reconstruit la structure attendue par CarnetCommandes.vue : groupe par client,
// avec pour chaque ligne la reference produit (gencod) et le tarif propre a ce client.
//
// Le carnet du jour affiche les commandes RECUES ce jour-la (date_commande),
// pas celles a livrer (date_livraison) — c'est le carnet de reception/traitement
// quotidien, pas un planning de livraison. Filet de securite : si date_commande
// n'a pas ete extraite du PDF, on se rabat sur la date d'insertion en base.
router.get('/:annee/:mois/:jour', async (req, res) => {
  try {
    const { annee, mois, jour } = req.params;
    const date = `${annee}-${mois}-${jour}`;

    const commandes = await knex('commandes')
      .join('clients', 'clients.id', 'commandes.client_id')
      .where(function () {
        this.where('commandes.date_reception_mail', date)
          .orWhere(function () {
            this.whereNull('commandes.date_reception_mail')
              .andWhereRaw('DATE(commandes.created_at) = ?', [date]);
          });
      })
      .select('commandes.*', 'clients.nom as client_nom');

    const result = [];
    for (const commande of commandes) {
      const lignes = await knex('lignes_commande as lc')
        .where('lc.commande_id', commande.id)
        .leftJoin('produits as p', 'p.id', 'lc.produit_id')
        .leftJoin('tarifs_client_produit as t', function () {
          this.on('t.produit_id', '=', 'p.id').andOn('t.client_id', '=', knex.raw('?', [commande.client_id]));
        })
        .select(
          'lc.*',
          'p.gencod',
          'p.designation as designation_officielle',
          't.tarif_net',
          't.tarif_general',
          't.remise_pct',
          't.unite_facturation as unite_tarif'
        );
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