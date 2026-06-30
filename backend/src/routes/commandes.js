const express = require('express');
const knex = require('../db/knex');

const router = express.Router();

// GET /api/commandes?annee=2026&mois=06 (filtre optionnel, historisation par date)
router.get('/', async (req, res) => {
  try {
    const { annee, mois } = req.query;
    let query = knex('commandes').join('clients', 'clients.id', 'commandes.client_id').select(
      'commandes.*',
      'clients.nom as client_nom'
    );
    if (annee) query = query.whereRaw('YEAR(date_livraison) = ?', [annee]);
    if (mois) query = query.andWhereRaw('MONTH(date_livraison) = ?', [mois]);
    const commandes = await query.orderBy('date_livraison', 'desc');
    res.json(commandes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/commandes/:id (avec ses lignes, reference produit + tarif client)
router.get('/:id', async (req, res) => {
  try {
    const commande = await knex('commandes').where({ id: req.params.id }).first();
    if (!commande) return res.status(404).json({ error: 'Commande introuvable' });

    const lignes = await knex('lignes_commande as lc')
      .where('lc.commande_id', req.params.id)
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

    res.json({ ...commande, lignes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/commandes/:id (changement de statut, etc.)
router.patch('/:id', async (req, res) => {
  try {
    await knex('commandes').where({ id: req.params.id }).update(req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/commandes/:id
router.delete('/:id', async (req, res) => {
  try {
    await knex('commandes').where({ id: req.params.id }).del();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
