require('dotenv').config();
const path = require('path');
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

// Sert le build Vue (genere par `npm run build` dans frontend/, copie ici)
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Route API inconnue' });
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Serveur fromagerie-app demarre sur http://localhost:${PORT}`);
});
