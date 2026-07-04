const express = require('express');
const bcrypt = require('bcryptjs');
const knex = require('../db/knex');
const { signerToken } = require('../auth/jwt');
const { requireAuth } = require('../auth/middleware');

const router = express.Router();

// POST /api/auth/login  { email, motDePasse }
router.post('/login', async (req, res) => {
  try {
    const { email, motDePasse } = req.body;
    if (!email || !motDePasse) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    const utilisateur = await knex('utilisateurs')
      .whereRaw('LOWER(email) = ?', [email.toLowerCase()])
      .first();

    // Message volontairement identique (email inconnu vs mauvais mot de passe)
    // pour ne pas laisser deviner quels emails existent en base.
    const messageEchec = 'Email ou mot de passe incorrect';

    if (!utilisateur || !utilisateur.actif) {
      return res.status(401).json({ error: messageEchec });
    }

    const motDePasseValide = await bcrypt.compare(motDePasse, utilisateur.mot_de_passe_hash);
    if (!motDePasseValide) {
      return res.status(401).json({ error: messageEchec });
    }

    await knex('utilisateurs').where({ id: utilisateur.id }).update({ derniere_connexion: knex.fn.now() });

    const token = signerToken(utilisateur);
    res.json({
      token,
      utilisateur: { id: utilisateur.id, email: utilisateur.email, nom: utilisateur.nom, role: utilisateur.role },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/auth/me — verifie la session courante et renvoie l'utilisateur (pour le frontend au chargement)
router.get('/me', requireAuth, async (req, res) => {
  try {
    const utilisateur = await knex('utilisateurs').where({ id: req.user.id }).first();
    if (!utilisateur || !utilisateur.actif) {
      return res.status(401).json({ error: 'Compte introuvable ou désactivé' });
    }
    res.json({ id: utilisateur.id, email: utilisateur.email, nom: utilisateur.nom, role: utilisateur.role });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
