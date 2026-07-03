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

// ── Échange manuel refresh_token → access_token via https natif ─────────────
// La librairie googleapis/gaxios utilise le fetch natif de Node (undici),
// qui provoque une erreur "Premature close" sur certains hébergeurs (Railway
// notamment) lors du streaming de la réponse JSON de oauth2.googleapis.com.
// On contourne le problème en faisant l'appel HTTPS nous-mêmes avec le
// module natif "https", qui n'a pas ce bug.
const https = require('https');

function echangerRefreshToken(clientId, clientSecret, refreshToken) {
  const postData = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  }).toString();

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (res.statusCode !== 200) {
              return reject(new Error(json.error_description || json.error || `HTTP ${res.statusCode}`));
            }
            resolve(json);
          } catch (e) {
            reject(new Error('Réponse OAuth invalide : ' + body.slice(0, 200)));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function avecRetry(fn, tentatives = 3, delaiMs = 800) {
  let derniereErreur;
  for (let i = 0; i < tentatives; i++) {
    try {
      return await fn();
    } catch (e) {
      derniereErreur = e;
      if (i === tentatives - 1) throw e;
      console.warn(`[gmail auth] Erreur réseau (tentative ${i + 1}/${tentatives}) : ${e.message} — nouvelle tentative dans ${delaiMs}ms`);
      await new Promise(r => setTimeout(r, delaiMs));
    }
  }
  throw derniereErreur;
}

// ── Création du client OAuth2 authentifié ────────────────────────────────────
async function creerClientAuthentifie(modeForce = null) {
  const mode = modeForce || await getModeActif();
  const { clientId, clientSecret, refreshToken, email } = getCredentials(mode);

  // Échange manuel (contourne le bug gaxios/undici "Premature close")
  const tokens = await avecRetry(() => echangerRefreshToken(clientId, clientSecret, refreshToken));

  const auth = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  auth.setCredentials({
    access_token: tokens.access_token,
    refresh_token: refreshToken,
    expiry_date: Date.now() + (tokens.expires_in || 3600) * 1000,
  });

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

// ── Requête HTTPS générique authentifiée (contourne gaxios/fetch) ───────────
// Utilisée pour TOUS les appels à l'API Gmail, car googleapis/gaxios plante
// systématiquement avec "Premature close" sur l'environnement réseau Railway.
function requeteGmailApi(accessToken, path, { method = 'GET', body = null } = {}) {
  const postData = body ? JSON.stringify(body) : null;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'gmail.googleapis.com',
        path,
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(postData ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = data ? JSON.parse(data) : {};
            if (res.statusCode >= 400) {
              return reject(new Error(json.error?.message || `HTTP ${res.statusCode} sur ${path}`));
            }
            resolve(json);
          } catch (e) {
            reject(new Error(`Réponse Gmail API invalide (${path}) : ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

module.exports.requeteGmailApi = requeteGmailApi;