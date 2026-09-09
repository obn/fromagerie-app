const express = require('express');
const knex = require('../db/knex');
const { requireAuth } = require('../auth/middleware');
const router = express.Router();

const CHAMPS_SYSTEME = ["id", "created_at", "updated_at", "client_nom"];
function nettoyer(body) { const b = { ...body }; CHAMPS_SYSTEME.forEach(c => delete b[c]); return b; }


function formatDateISO(date) {
  const d = new Date(date);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

function getSemaine(dateParam) {
  const reference = dateParam ? new Date(dateParam + 'T12:00:00') : new Date();
  if (Number.isNaN(reference.getTime())) {
    throw new Error('Date invalide');
  }

  const lundi = new Date(reference);
  lundi.setHours(0, 0, 0, 0);
  const jour = lundi.getDay();
  const decalage = (jour === 0 ? -6 : 1 - jour);
  lundi.setDate(lundi.getDate() + decalage);

  const dimanche = new Date(lundi);
  dimanche.setDate(lundi.getDate() + 6);

  return {
    debutSemaine: formatDateISO(lundi),
    finSemaine: formatDateISO(dimanche),
  };
}

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

// GET /api/commandes/semaine?date=YYYY-MM-DD
router.get('/semaine', requireAuth, async (req, res) => {
  try {
    const { date } = req.query;
    const semaine = getSemaine(date || formatDateISO(new Date()));

    const commandes = await knex('livraisons')
      .join('commandes', 'commandes.id', 'livraisons.commande_id')
      .join('clients', 'clients.id', 'commandes.client_id')
      .select(
        'livraisons.id as id',
        'livraisons.commande_id as commande_id',
        'commandes.numero_commande as numero_commande',
        'clients.nom as client_nom',
        'livraisons.date_livraison as date_livraison',
        'livraisons.statut as statut',
        'livraisons.heure_prevue as heure_prevue',
        'livraisons.heure_reelle as heure_reelle',
        'livraisons.commentaire as commentaire'
      )
      .whereRaw('DATE(livraisons.date_livraison) >= ?', [semaine.debutSemaine])
      .andWhereRaw('DATE(livraisons.date_livraison) <= ?', [semaine.finSemaine])
      .orderBy('livraisons.date_livraison', 'asc')
      .orderBy('commandes.numero_commande', 'asc');

    res.json({
      debutSemaine: semaine.debutSemaine,
      finSemaine: semaine.finSemaine,
      commandes,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PATCH /api/commandes/livraisons/:id
router.patch('/livraisons/:id', requireAuth, async (req, res) => {
  try {
    const { statut, heure_reelle, commentaire } = req.body || {};
    const update = {};

    if (statut !== undefined) update.statut = statut;
    if (heure_reelle !== undefined) update.heure_reelle = heure_reelle || null;
    if (commentaire !== undefined) update.commentaire = commentaire || null;

    if (!Object.keys(update).length) {
      return res.status(400).json({ error: 'Aucune donnée de livraison à mettre à jour' });
    }

    await knex('livraisons').where({ id: req.params.id }).update(update);
    const livraison = await knex('livraisons').where({ id: req.params.id }).first();
    res.json(livraison);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/commandes
router.post('/', async (req, res) => {
  try {
    const body = nettoyer(req.body);
    const [id] = await knex('commandes').insert(body);

    if (body.date_livraison) {
      await knex('livraisons').insert({
        commande_id: id,
        date_livraison: body.date_livraison,
        statut: 'prevue',
      });
    }

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
  try { await knex('commandes').where({ id: req.params.id }).update(nettoyer(req.body)); res.json({ ok: true }); }
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
    const [lid] = await knex('lignes_commande').insert({ ...nettoyer(req.body), commande_id: req.params.id });
    res.status(201).json(await knex('lignes_commande').where({ id: lid }).first());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/commandes/:id/lignes/:lid
router.patch('/:id/lignes/:lid', async (req, res) => {
  try {
    const updateFields = nettoyer(req.body);
    await knex('lignes_commande').where({ id: req.params.lid }).update(updateFields);
    res.json({ ok: true });
  }
  catch (e) {
    console.error('[commandes] PATCH lignes failed', { commandeId: req.params.id, ligneId: req.params.lid, body: req.body, error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/commandes/:id/lignes/:lid
router.delete('/:id/lignes/:lid', async (req, res) => {
  try { await knex('lignes_commande').where({ id: req.params.lid }).del(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;