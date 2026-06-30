const express = require('express');
const knex = require('../db/knex');

const router = express.Router();

// GET /api/referentiels/produits
router.get('/produits', async (req, res) => {
  try {
    res.json(await knex('produits').orderBy('designation'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/referentiels/produits/:id
router.patch('/produits/:id', async (req, res) => {
  try {
    await knex('produits').where({ id: req.params.id }).update(req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/referentiels/produits/:id
router.delete('/produits/:id', async (req, res) => {
  try {
    await knex('produits').where({ id: req.params.id }).del();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/referentiels/tarifs?client_id=1
router.get('/tarifs', async (req, res) => {
  try {
    let query = knex('tarifs_client_produit')
      .join('produits', 'produits.id', 'tarifs_client_produit.produit_id')
      .join('clients', 'clients.id', 'tarifs_client_produit.client_id')
      .select('tarifs_client_produit.*', 'produits.designation', 'clients.nom as client_nom');
    if (req.query.client_id) query = query.where('tarifs_client_produit.client_id', req.query.client_id);
    res.json(await query);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/referentiels/codes-internes?client_id=1
router.get('/codes-internes', async (req, res) => {
  try {
    let query = knex('codes_internes').leftJoin('produits', 'produits.id', 'codes_internes.produit_id').select(
      'codes_internes.*',
      'produits.designation'
    );
    if (req.query.client_id) query = query.where('codes_internes.client_id', req.query.client_id);
    res.json(await query);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/referentiels/codes-internes/:id (resolution manuelle vers un produit)
router.patch('/codes-internes/:id', async (req, res) => {
  try {
    await knex('codes_internes').where({ id: req.params.id }).update(req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// GET /api/referentiels/clients
router.get('/clients', async (req, res) => {
  try {
    res.json(await knex('clients').where({ actif: true }).orderBy('nom'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/referentiels/interne (catalogue interne : familles + refs produits)
router.get('/interne', async (req, res) => {
  try {
    const familles = await knex('familles_produits').orderBy('code');
    const produits = await knex('ref_produits_internes as r')
      .leftJoin('familles_produits as f', 'f.code', 'r.famille_code')
      .select('r.*', 'f.libelle as famille_libelle')
      .orderBy('r.famille_code')
      .orderBy('r.code_interne');
    res.json({ familles, produits });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/parametres (creation)
