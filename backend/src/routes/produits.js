const express = require('express');
const knex = require('../db/knex');
const { requireAuth } = require('../auth/middleware');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
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

    const produits = await query.orderBy('designation');
    res.json(produits);
  } catch (e) {
    console.error('[produits] GET search failed', e);
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { ref_zacher } = req.body || {};
    const update = {};

    if (ref_zacher !== undefined) update.ref_zacher = ref_zacher || null;

    if (!Object.keys(update).length) {
      return res.status(400).json({ error: 'Aucune donnée produit à mettre à jour' });
    }

    const affected = await knex('produits').where({ id: req.params.id }).update(update);

    if (!affected) {
      return res.status(404).json({ error: `Produit introuvable (id=${req.params.id})` });
    }

    const produit = await knex('produits').where({ id: req.params.id }).first();
    res.json({ ok: true, affectedRows: affected, produit });
  } catch (e) {
    console.error('[produits] PATCH failed', { id: req.params.id, body: req.body, error: e.message });
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
