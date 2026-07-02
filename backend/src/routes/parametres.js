const express = require('express');
const knex = require('../db/knex');
const router = express.Router();

router.get('/', async (req, res) => {
  try { res.json(await knex('parametres').orderBy('cle')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/', async (req, res) => {
  try {
    const [id] = await knex('parametres').insert(req.body);
    res.status(201).json(await knex('parametres').where({ id }).first());
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.patch('/:id', async (req, res) => {
  try { await knex('parametres').where({ id: req.params.id }).update(req.body); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/:id', async (req, res) => {
  try { await knex('parametres').where({ id: req.params.id }).del(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
