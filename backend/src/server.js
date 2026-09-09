require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const authRoutes         = require('./routes/auth');
const commandesRoutes    = require('./routes/commandes');
const carnetRoutes       = require('./routes/carnet');
const produitsRoutes     = require('./routes/produits');
const referentielsRoutes = require('./routes/referentiels');
const parametresRoutes   = require('./routes/parametres');
const gmailRoutes        = require('./routes/gmail');
const { requireAuth, requireRole } = require('./auth/middleware');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true, version: '1.0.0' }));

// Authentification : ouverte (login) — /me protegee par requireAuth en interne
app.use('/api/auth', authRoutes);

// Carnet + Commandes + Produits : accessibles a tout utilisateur connecte (admin ou gestionnaire)
app.use('/api/commandes', requireAuth, commandesRoutes);
app.use('/api/carnet',    requireAuth, carnetRoutes);
app.use('/api/produits',  requireAuth, produitsRoutes);

// Referentiels + Parametres + Gmail : reserves aux admins uniquement
app.use('/api/referentiels', requireRole('admin'), referentielsRoutes);
app.use('/api/parametres',   requireRole('admin'), parametresRoutes);
app.use('/api/gmail',        requireRole('admin'), gmailRoutes);

// Fichiers statiques Vue (build)
const publicDir = path.join(__dirname, 'public');
const indexHtml = path.join(publicDir, 'index.html');
app.use(express.static(publicDir));

// Page publique : politique de confidentialité
app.get('/confidentialite', (req, res) => {
  // sert un fichier HTML autonome situé dans backend/src/public-pages/
  const file = path.join(__dirname, 'public-pages', 'confidentialite.html');
  if (fs.existsSync(file)) {
    res.sendFile(file);
  } else {
    res.status(404).send('<html><body style="font-family:sans-serif;padding:40px"><h2>Politique de confidentialité</h2><p>Page non trouvée.</p></body></html>');
  }
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Route API inconnue' });
  if (fs.existsSync(indexHtml)) {
    res.sendFile(indexHtml);
  } else {
    res.send('<html><body style="font-family:sans-serif;padding:40px"><h2>API en ligne ✓</h2><p>Build frontend absent.</p></body></html>');
  }
});

app.listen(PORT, async () => {
  console.log(`Serveur fromagerie-app demarre sur http://localhost:${PORT}`);
  // Démarrer le cron Gmail après le démarrage du serveur
  try {
    const { demarrerCron } = require('./gmail/cron');
    await demarrerCron();
  } catch (e) {
    console.warn('[cron] Non démarré :', e.message);
  }
});
