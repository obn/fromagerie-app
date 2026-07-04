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
    const { creerClientAuthentifie, requeteGmailApi } = require('../gmail/auth');
    const modeForce = req.query.mode || null;
    const { auth, mode, email } = await creerClientAuthentifie(modeForce);
    const profil = await requeteGmailApi(auth.credentials.access_token, '/gmail/v1/users/me/profile');
    res.json({ ok: true, mode, email_config: email, email_gmail: profil.emailAddress });
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

// POST /api/gmail/deplacer-historique
// Body : { annee, mois, jour, objet, mode, dryRun }
// annee/mois/jour sont optionnels et combinables (voir construireRequete) :
//   - annee+mois+jour -> une seule journee
//   - annee+mois      -> un mois entier
//   - annee seule     -> une annee entiere
//   - objet seul (aucune date) -> tous les mails correspondant a l'objet, sans limite de date
router.post('/deplacer-historique', async (req, res) => {
  try {
    const { annee, mois, jour, objet, mode, dryRun } = req.body;
    const { construireRequete, deplacerVersHistorique } = require('../gmail/deplacer-historique');

    const requete = construireRequete({
      annee: annee ? parseInt(annee, 10) : null,
      mois: mois ? parseInt(mois, 10) : null,
      jour: jour ? parseInt(jour, 10) : null,
      objet: objet || 'COMMANDE',
    });

    if (!requete.trim()) {
      return res.status(400).json({ error: 'Aucun critere fourni (objet ou date requis)' });
    }

    const rapport = await deplacerVersHistorique({ mode: mode || 'test', requete, dryRun: !!dryRun });
    res.json(rapport);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;