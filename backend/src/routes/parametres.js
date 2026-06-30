const express = require('express');
const knex = require('../db/knex');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    res.json(await knex('parametres').orderBy('cle'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    await knex('parametres').where({ id: req.params.id }).update(req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await knex('parametres').where({ id: req.params.id }).del();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

router.post('/', async (req, res) => {
  try {
    const [id] = await knex('parametres').insert(req.body);
    const nouveau = await knex('parametres').where({ id }).first();
    res.status(201).json(nouveau);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
