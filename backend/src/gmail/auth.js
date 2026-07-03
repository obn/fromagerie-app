/**
 * Authentification Gmail OAuth2 — support multi-comptes.
 *
 * Deux modes configurables via la table parametres (cle: gmail_mode) :
 *   - "test"        → utilise GMAIL_TEST_* (ton Gmail personnel)
 *   - "production"  → utilise GMAIL_PROD_* (Gmail du projet fromagerie)
 *
 * Variables .env requises (préfixe TEST ou PROD selon le mode) :
 *   GMAIL_TEST_CLIENT_ID
 *   GMAIL_TEST_CLIENT_SECRET
 *   GMAIL_TEST_REFRESH_TOKEN
 *   GMAIL_TEST_EMAIL            (pour affichage seulement)
 *
 *   GMAIL_PROD_CLIENT_ID
 *   GMAIL_PROD_CLIENT_SECRET
 *   GMAIL_PROD_REFRESH_TOKEN
 *   GMAIL_PROD_EMAIL
 *
 * SETUP (une seule fois par compte) :
 *   node src/gmail/auth.js --setup test
 *   node src/gmail/auth.js --setup prod
 */

require('dotenv').config();
const { google } = require('googleapis');
const readline = require('readline');
const knex = require('../db/knex');

const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
];

// ── Lecture du mode actif depuis la DB ───────────────────────────────────────
async function getModeActif() {
  try {
    const param = await knex('parametres').where({ cle: 'gmail_mode' }).first();
    return param?.valeur || 'test';
  } catch (e) {
    return 'test';
  }
}

// ── Credentials selon le mode ────────────────────────────────────────────────
function getCredentials(mode) {
  const prefix = mode === 'production' ? 'GMAIL_PROD' : 'GMAIL_TEST';
  const clientId     = process.env[`${prefix}_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
  const refreshToken = process.env[`${prefix}_REFRESH_TOKEN`];
  const email        = process.env[`${prefix}_EMAIL`] || `compte ${mode}`;

  if (!clientId || !clientSecret) {
    throw new Error(
      `Credentials Gmail manquants pour le mode "${mode}". ` +
      `Vérifier ${prefix}_CLIENT_ID et ${prefix}_CLIENT_SECRET dans .env`
    );
  }
  if (!refreshToken) {
    throw new Error(
      `Refresh token absent pour le mode "${mode}". ` +
      `Lancer : node src/gmail/auth.js --setup ${mode}`
    );
  }

  return { clientId, clientSecret, refreshToken, email };
}

// ── Création du client OAuth2 authentifié ────────────────────────────────────
async function creerClientAuthentifie(modeForce = null) {
  const mode = modeForce || await getModeActif();
  const { clientId, clientSecret, refreshToken, email } = getCredentials(mode);

  const auth = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  auth.setCredentials({ refresh_token: refreshToken });

  return { auth, mode, email };
}

// ── Setup interactif (une seule fois par compte) ──────────────────────────────
async function setup(mode) {
  const prefix = mode === 'production' ? 'GMAIL_PROD' : 'GMAIL_TEST';
  const clientId     = process.env[`${prefix}_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];

  if (!clientId || !clientSecret) {
    console.error(`\n❌ ${prefix}_CLIENT_ID et ${prefix}_CLIENT_SECRET doivent être dans .env avant le setup.\n`);
    process.exit(1);
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  const urlAuth = auth.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });

  console.log(`\n=== SETUP GMAIL — mode "${mode}" ===\n`);
  console.log('1. Ouvre cette URL dans ton navigateur :');
  console.log('\n' + urlAuth + '\n');
  console.log('2. Connecte-toi avec le bon compte Gmail et autorise l\'application.');
  console.log('3. Copie le code affiché.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('4. Colle le code ici : ', async (code) => {
    rl.close();
    try {
      const { tokens } = await auth.getToken(code.trim());
      console.log('\n✅ Authentification réussie !\n');
      console.log(`Ajoute ces lignes dans ton .env ET dans Railway Variables :\n`);
      console.log(`${prefix}_REFRESH_TOKEN=${tokens.refresh_token}`);
      console.log(`\nSi pas encore fait :`);
      console.log(`${prefix}_CLIENT_ID=${clientId}`);
      console.log(`${prefix}_CLIENT_SECRET=${clientSecret}`);
      console.log(`${prefix}_EMAIL=ton@gmail.com`);
    } catch (e) {
      console.error('Erreur lors de l\'échange du code :', e.message);
    }
  });
}

if (require.main === module) {
  const arg = process.argv[2];
  const mode = process.argv[3] || 'test';
  if (arg === '--setup') setup(mode);
  else console.log('Usage : node src/gmail/auth.js --setup [test|prod]');
}

module.exports = { creerClientAuthentifie, getModeActif };