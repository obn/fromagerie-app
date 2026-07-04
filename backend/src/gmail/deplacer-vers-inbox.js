/**
 * Deplace des mails Gmail depuis la boite de reception vers le label
 * "historique" (retire INBOX, ajoute le label configure).
 *
 * Usage :
 *   node src/gmail/deplacer-vers-inbox.js --mode test --requete "subject:COMMANDE after:2026/01/01 before:2026/02/01"
 *   node src/gmail/deplacer-vers-inbox.js --mode prod --requete "subject:COMMANDE after:2026/01/01 before:2026/02/01"
 *
 * --mode : "test" (defaut) ou "prod" — determine quel compte Gmail utiliser
 * --requete : recherche Gmail standard (subject:, after:, before:, from:, etc.)
 *             Seuls les mails actuellement dans la boite de reception (INBOX)
 *             sont deplaces, meme si la recherche en trouve d'autres ailleurs.
 * --dry-run : n'effectue aucune modification, affiche juste ce qui serait fait
 *
 * Le nom du label de destination est lu dans la table parametres
 * (cle: gmail_label_commandes_historisees), avec comme valeur par defaut
 * "Commandes/commandes historisées". Le label est cree automatiquement s'il
 * n'existe pas encore sur le compte Gmail.
 */

require('dotenv').config();
const { creerClientAuthentifie, requeteGmailApi } = require('./auth');
const knex = require('../db/knex');

const LABEL_HISTORIQUE_PAR_DEFAUT = 'Commandes/commandes historisées';

function parseArgs() {
  const args = process.argv.slice(2);
  const params = { mode: 'test', requete: null, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mode') params.mode = args[++i];
    else if (args[i] === '--requete') params.requete = args[++i];
    else if (args[i] === '--dry-run') params.dryRun = true;
  }
  return params;
}

async function getLabelHistorique() {
  try {
    const param = await knex('parametres').where({ cle: 'gmail_label_commandes_historisees' }).first();
    return param?.valeur || LABEL_HISTORIQUE_PAR_DEFAUT;
  } catch (e) {
    return LABEL_HISTORIQUE_PAR_DEFAUT;
  }
}

/**
 * Retrouve l'ID du label par son nom, ou le cree s'il n'existe pas.
 * Gmail gere nativement les labels imbriques via un "/" dans le nom
 * (ex: "Commandes/commandes historisées").
 */
async function resoudreOuCreerLabel(accessToken, nomLabel, dryRun) {
  const res = await requeteGmailApi(accessToken, '/gmail/v1/users/me/labels');
  const labels = res.labels || [];
  const existant = labels.find(l => l.name.toLowerCase() === nomLabel.toLowerCase());
  if (existant) return existant.id;

  if (dryRun) {
    console.log(`  (dry-run) Le label "${nomLabel}" n'existe pas — serait cree`);
    return null;
  }

  console.log(`Label "${nomLabel}" introuvable — creation...`);
  const nouveau = await requeteGmailApi(accessToken, '/gmail/v1/users/me/labels', {
    method: 'POST',
    body: { name: nomLabel, labelListVisibility: 'labelShow', messageListVisibility: 'show' },
  });
  return nouveau.id;
}

async function listerTousLesMessages(accessToken, requete) {
  const messages = [];
  let pageToken = null;

  do {
    const q = encodeURIComponent(requete);
    const pt = pageToken ? `&pageToken=${pageToken}` : '';
    const res = await requeteGmailApi(accessToken, `/gmail/v1/users/me/messages?q=${q}&maxResults=100${pt}`);
    if (res.messages) messages.push(...res.messages);
    pageToken = res.nextPageToken || null;
  } while (pageToken);

  return messages;
}

async function deplacerVersHistorique() {
  const { mode, requete, dryRun } = parseArgs();

  if (!requete) {
    console.error('Usage : node src/gmail/deplacer-vers-inbox.js --mode test --requete "subject:COMMANDE after:2026/01/01 before:2026/02/01" [--dry-run]');
    process.exit(1);
  }

  const { auth, email } = await creerClientAuthentifie(mode);
  const accessToken = auth.credentials.access_token;
  const nomLabelHistorique = await getLabelHistorique();

  console.log(`Compte : ${email} (mode ${mode})`);
  console.log(`Recherche : ${requete}`);
  console.log(`Destination : "${nomLabelHistorique}"`);
  if (dryRun) console.log('(mode --dry-run : aucune modification ne sera appliquee)\n');
  else console.log('');

  const labelId = await resoudreOuCreerLabel(accessToken, nomLabelHistorique, dryRun);
  if (!labelId && !dryRun) {
    console.error('Impossible de resoudre ou creer le label de destination.');
    process.exit(1);
  }

  const messages = await listerTousLesMessages(accessToken, requete);
  console.log(`${messages.length} mail(s) trouve(s) pour la recherche\n`);

  if (messages.length === 0) return;

  let nbDeplaces = 0;
  let nbIgnores = 0;

  for (const { id } of messages) {
    const msg = await requeteGmailApi(accessToken, `/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject`);
    const sujet = msg.payload?.headers?.find(h => h.name === 'Subject')?.value || '(sans objet)';
    const dansInbox = (msg.labelIds || []).includes('INBOX');

    if (!dansInbox) {
      console.log(`  = pas dans la boite de reception, ignore : "${sujet}"`);
      nbIgnores++;
      continue;
    }

    console.log(`  → deplacement vers "${nomLabelHistorique}" : "${sujet}"`);
    if (!dryRun) {
      await requeteGmailApi(accessToken, `/gmail/v1/users/me/messages/${id}/modify`, {
        method: 'POST',
        body: { removeLabelIds: ['INBOX'], addLabelIds: [labelId] },
      });
    }
    nbDeplaces++;
  }

  console.log(`\nTermine — ${nbDeplaces} mail(s) deplace(s) vers "${nomLabelHistorique}", ${nbIgnores} ignore(s) (deja hors inbox)`);
  if (dryRun) console.log('(--dry-run actif : rien n\'a ete reellement modifie)');
}

deplacerVersHistorique()
  .then(() => knex.destroy())
  .catch(e => {
    console.error('Erreur :', e.message);
    knex.destroy();
    process.exit(1);
  });