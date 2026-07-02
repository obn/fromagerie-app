const express = require('express');
const knex = require('../db/knex');
const router = express.Router();

// GET /api/commandes?annee=2026&mois=06
router.get('/', async (req, res) => {
  try {
    const { annee, mois } = req.query;
    let q = knex('commandes').join('clients', 'clients.id', 'commandes.client_id')
      .select('commandes.*', 'clients.nom as client_nom');
    if (annee) q = q.whereRaw('YEAR(date_livraison) = ?', [annee]);
    if (mois)  q = q.andWhereRaw('MONTH(date_livraison) = ?', [mois]);
    res.json(await q.orderBy('date_livraison', 'desc'));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/commandes
router.post('/', async (req, res) => {
  try {
    const [id] = await knex('commandes').insert(req.body);
    res.status(201).json(await knex('commandes').where({ id }).first());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/commandes/:id (avec lignes enrichies)
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
      .select('lc.*', 'p.gencod', 'p.designation as designation_officielle',
              't.tarif_net', 't.tarif_general', 't.remise_pct', 't.unite_facturation as unite_tarif');
    res.json({ ...commande, lignes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/commandes/:id
router.patch('/:id', async (req, res) => {
  try { await knex('commandes').where({ id: req.params.id }).update(req.body); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/commandes/:id
router.delete('/:id', async (req, res) => {
  try { await knex('commandes').where({ id: req.params.id }).del(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── LIGNES DE COMMANDE ──────────────────────────────────────────────────────
// POST /api/commandes/:id/lignes
router.post('/:id/lignes', async (req, res) => {
  try {
    const [lid] = await knex('lignes_commande').insert({ ...req.body, commande_id: req.params.id });
    res.status(201).json(await knex('lignes_commande').where({ id: lid }).first());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/commandes/:id/lignes/:lid
router.patch('/:id/lignes/:lid', async (req, res) => {
  try { await knex('lignes_commande').where({ id: req.params.lid }).update(req.body); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/commandes/:id/lignes/:lid
router.delete('/:id/lignes/:lid', async (req, res) => {
  try { await knex('lignes_commande').where({ id: req.params.lid }).del(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
