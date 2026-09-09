const express = require('express');
const knex = require('../db/knex');
const router = express.Router();

// Supprime les champs systeme qu'on ne doit jamais ecraser via PATCH
const CHAMPS_SYSTEME = ['id', 'created_at', 'updated_at'];
function nettoyer(body) {
  const b = { ...body };
  CHAMPS_SYSTEME.forEach(c => delete b[c]);
  return b;
}

// ─── CLIENTS ────────────────────────────────────────────────────────────────
router.get('/clients', async (req, res) => {
  try { res.json(await knex('clients').orderBy('nom')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/clients', async (req, res) => {
  try {
    const [id] = await knex('clients').insert(nettoyer(req.body));
    res.status(201).json(await knex('clients').where({ id }).first());
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.patch('/clients/:id', async (req, res) => {
  try { await knex('clients').where({ id: req.params.id }).update(nettoyer(req.body)); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/clients/:id', async (req, res) => {
  try { await knex('clients').where({ id: req.params.id }).del(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PRODUITS ────────────────────────────────────────────────────────────────
router.get('/produits', async (req, res) => {
  try {
    const q = String(req.query.search || '').trim();
    let query = knex('produits');

    if (q) {
      const like = `%${q.toLowerCase()}%`;
      query = query.where(function () {
        this.whereRaw('LOWER(designation) LIKE ?', [like])
          .orWhereRaw('LOWER(ref_zacher) LIKE ?', [like])
          .orWhereRaw('LOWER(gencod) LIKE ?', [like]);
      });
    }

    res.json(await query.orderBy('designation'));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/produits', async (req, res) => {
  try {
    const [id] = await knex('produits').insert(nettoyer(req.body));
    res.status(201).json(await knex('produits').where({ id }).first());
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.patch('/produits/:id', async (req, res) => {
  try { await knex('produits').where({ id: req.params.id }).update(nettoyer(req.body)); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/produits/:id', async (req, res) => {
  try { await knex('produits').where({ id: req.params.id }).del(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── TARIFS CLIENT/PRODUIT ───────────────────────────────────────────────────
router.get('/tarifs', async (req, res) => {
  try {
    let q = knex('tarifs_client_produit as t')
      .join('produits as p', 'p.id', 't.produit_id')
      .join('clients as c', 'c.id', 't.client_id')
      .select('t.*', 'p.designation', 'p.gencod', 'c.nom as client_nom')
      .orderBy('c.nom').orderBy('p.designation');
    if (req.query.client_id) q = q.where('t.client_id', req.query.client_id);
    res.json(await q);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/tarifs', async (req, res) => {
  try {
    const [id] = await knex('tarifs_client_produit').insert(nettoyer(req.body));
    res.status(201).json(await knex('tarifs_client_produit').where({ id }).first());
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.patch('/tarifs/:id', async (req, res) => {
  try { await knex('tarifs_client_produit').where({ id: req.params.id }).update(nettoyer(req.body)); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/tarifs/:id', async (req, res) => {
  try { await knex('tarifs_client_produit').where({ id: req.params.id }).del(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── CODES INTERNES ──────────────────────────────────────────────────────────
router.get('/codes-internes', async (req, res) => {
  try {
    let q = knex('codes_internes as ci')
      .join('clients as c', 'c.id', 'ci.client_id')
      .leftJoin('produits as p', 'p.id', 'ci.produit_id')
      .select('ci.*', 'c.nom as client_nom', 'p.designation', 'p.gencod')
      .orderBy('c.nom').orderBy('ci.code_interne');
    if (req.query.client_id) q = q.where('ci.client_id', req.query.client_id);
    res.json(await q);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/codes-internes', async (req, res) => {
  try {
    const [id] = await knex('codes_internes').insert(nettoyer(req.body));
    res.status(201).json(await knex('codes_internes').where({ id }).first());
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.patch('/codes-internes/:id', async (req, res) => {
  try { await knex('codes_internes').where({ id: req.params.id }).update(nettoyer(req.body)); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/codes-internes/:id', async (req, res) => {
  try { await knex('codes_internes').where({ id: req.params.id }).del(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── CATALOGUE INTERNE ───────────────────────────────────────────────────────
router.get('/interne', async (req, res) => {
  try {
    const familles = await knex('familles_produits').orderBy('code');
    const produits = await knex('ref_produits_internes as r')
      .leftJoin('familles_produits as f', 'f.code', 'r.famille_code')
      .select('r.*', 'f.libelle as famille_libelle')
      .orderBy('r.famille_code').orderBy('r.code_interne');
    res.json({ familles, produits });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/interne/familles', async (req, res) => {
  try {
    await knex('familles_produits').insert(nettoyer(req.body));
    res.status(201).json(await knex('familles_produits').where({ code: req.body.code }).first());
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.patch('/interne/familles/:code', async (req, res) => {
  try { await knex('familles_produits').where({ code: req.params.code }).update(nettoyer(req.body)); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/interne/familles/:code', async (req, res) => {
  try { await knex('familles_produits').where({ code: req.params.code }).del(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/interne/produits', async (req, res) => {
  try {
    await knex('ref_produits_internes').insert(nettoyer(req.body));
    res.status(201).json(await knex('ref_produits_internes').where({ code_interne: req.body.code_interne }).first());
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.patch('/interne/produits/:code', async (req, res) => {
  try { await knex('ref_produits_internes').where({ code_interne: req.params.code }).update(nettoyer(req.body)); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/interne/produits/:code', async (req, res) => {
  try { await knex('ref_produits_internes').where({ code_interne: req.params.code }).del(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;