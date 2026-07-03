const express = require('express');
const router = express.Router();

let syncEnCours = false;
let dernierRapport = null;

// POST /api/gmail/sync — déclenche une sync manuelle
router.post('/sync', async (req, res) => {
  if (syncEnCours) {
    return res.status(409).json({ error: 'Une synchronisation est déjà en cours' });
  }

  // On répond immédiatement puis on sync en arrière-plan
  res.json({ message: 'Synchronisation démarrée', en_cours: true });

  syncEnCours = true;
  try {
    const { syncGmail } = require('../gmail');
    dernierRapport = await syncGmail();
    dernierRapport.date = new Date().toISOString();
  } catch (e) {
    dernierRapport = { erreur: e.message, date: new Date().toISOString() };
    console.error('[gmail route] Erreur sync :', e.message);
  } finally {
    syncEnCours = false;
  }
});

// GET /api/gmail/statut — dernier rapport de sync
router.get('/statut', (req, res) => {
  res.json({
    en_cours: syncEnCours,
    dernier_rapport: dernierRapport,
  });
});

// GET /api/gmail/test — vérifie que les credentials sont valides
router.get('/test', async (req, res) => {
  try {
    const { creerClientAuthentifie } = require('../gmail/auth');
    const { google } = require('googleapis');
    const auth = creerClientAuthentifie();
    const gmail = google.gmail({ version: 'v1', auth });
    const profil = await gmail.users.getProfile({ userId: 'me' });
    res.json({ ok: true, email: profil.data.emailAddress });
  } catch (e) {
    res.status(500).json({ ok: false, erreur: e.message });
  }
});

module.exports = router;
