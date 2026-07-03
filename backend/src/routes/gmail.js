const express = require('express');
const router = express.Router();

let syncEnCours = false;
let dernierRapport = null;

// POST /api/gmail/sync?mode=test|prod
router.post('/sync', async (req, res) => {
  if (syncEnCours) {
    return res.status(409).json({ error: 'Une synchronisation est déjà en cours' });
  }

  const modeForce = req.query.mode || null; // null = lit la DB
  res.json({ message: 'Synchronisation démarrée', mode: modeForce || 'auto', en_cours: true });

  syncEnCours = true;
  try {
    const { syncGmail } = require('../gmail');
    dernierRapport = await syncGmail(modeForce);
    dernierRapport.date = new Date().toISOString();
  } catch (e) {
    dernierRapport = { erreur: e.message, date: new Date().toISOString() };
    console.error('[gmail route] Erreur sync :', e.message);
  } finally {
    syncEnCours = false;
  }
});

// GET /api/gmail/statut
router.get('/statut', (req, res) => {
  res.json({ en_cours: syncEnCours, dernier_rapport: dernierRapport });
});

// GET /api/gmail/test?mode=test|prod
router.get('/test', async (req, res) => {
  try {
    const { creerClientAuthentifie } = require('../gmail/auth');
    const { google } = require('googleapis');
    const modeForce = req.query.mode || null;
    const { auth, mode, email } = await creerClientAuthentifie(modeForce);
    const gmail = google.gmail({ version: 'v1', auth });
    const profil = await gmail.users.getProfile({ userId: 'me' });
    res.json({ ok: true, mode, email_config: email, email_gmail: profil.data.emailAddress });
  } catch (e) {
    res.status(500).json({ ok: false, erreur: e.message });
  }
});

// GET /api/gmail/mode — renvoie le mode actif
router.get('/mode', async (req, res) => {
  try {
    const { getModeActif } = require('../gmail/auth');
    const mode = await getModeActif();
    res.json({ mode });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
