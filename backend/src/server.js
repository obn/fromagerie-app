require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const commandesRoutes = require('./routes/commandes');
const carnetRoutes = require('./routes/carnet');
const referentielsRoutes = require('./routes/referentiels');
const parametresRoutes = require('./routes/parametres');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/commandes', commandesRoutes);
app.use('/api/carnet', carnetRoutes);
app.use('/api/referentiels', referentielsRoutes);
app.use('/api/parametres', parametresRoutes);

// Sert le build Vue si present, sinon affiche un message d'attente
const publicDir = path.join(__dirname, 'public');
const indexHtml = path.join(publicDir, 'index.html');

app.use(express.static(publicDir));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Route API inconnue' });
  if (fs.existsSync(indexHtml)) {
    res.sendFile(indexHtml);
  } else {
    res.send('<html><body style="font-family:sans-serif;padding:40px"><h2>API en ligne</h2><p>Le build frontend n\'est pas encore disponible. Lancez <code>npm run build</code> dans le dossier frontend/.</p></body></html>');
  }
});

app.listen(PORT, () => {
  console.log(`Serveur fromagerie-app demarre sur http://localhost:${PORT}`);
});