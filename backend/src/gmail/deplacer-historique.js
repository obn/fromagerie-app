/**
 * Logique partagee de deplacement des mails de la boite de reception vers le
 * label historique. Utilisee a la fois par le script CLI et par la route API
 * (declenchee depuis la page Parametres).
 */

const { creerClientAuthentifie, requeteGmailApi } = require('./auth');
const knex = require('../db/knex');

const LABEL_HISTORIQUE_PAR_DEFAUT = 'Commandes/commandes historisées';

async function getLabelHistorique() {
  try {
    const param = await knex('parametres').where({ cle: 'gmail_label_commandes_historisees' }).first();
    return param?.valeur || LABEL_HISTORIQUE_PAR_DEFAUT;
  } catch (e) {
    return LABEL_HISTORIQUE_PAR_DEFAUT;
  }
}

async function resoudreOuCreerLabel(accessToken, nomLabel, dryRun) {
  const res = await requeteGmailApi(accessToken, '/gmail/v1/users/me/labels');
  const labels = res.labels || [];
  const existant = labels.find(l => l.name.toLowerCase() === nomLabel.toLowerCase());
  if (existant) return existant.id;
  if (dryRun) return null;

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

/**
 * Construit une requete Gmail (operateurs subject:/after:/before:) a partir
 * de criteres optionnels annee/mois/jour et d'un texte a chercher dans l'objet.
 *
 * - annee+mois+jour  -> restreint a cette seule journee
 * - annee+mois       -> restreint a ce mois entier
 * - annee seule      -> restreint a cette annee entiere
 * - rien             -> aucune restriction de date
 */
function construireRequete({ annee, mois, jour, objet }) {
  const parties = [];
  if (objet) parties.push(`subject:${objet}`);

  if (annee && mois && jour) {
    const debut = new Date(Date.UTC(annee, mois - 1, jour));
    const fin = new Date(Date.UTC(annee, mois - 1, jour + 1));
    parties.push(`after:${fmtGmailDate(debut)}`, `before:${fmtGmailDate(fin)}`);
  } else if (annee && mois) {
    const debut = new Date(Date.UTC(annee, mois - 1, 1));
    const fin = new Date(Date.UTC(annee, mois, 1));
    parties.push(`after:${fmtGmailDate(debut)}`, `before:${fmtGmailDate(fin)}`);
  } else if (annee) {
    const debut = new Date(Date.UTC(annee, 0, 1));
    const fin = new Date(Date.UTC(annee + 1, 0, 1));
    parties.push(`after:${fmtGmailDate(debut)}`, `before:${fmtGmailDate(fin)}`);
  }

  return parties.join(' ');
}

function fmtGmailDate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const j = String(d.getUTCDate()).padStart(2, '0');
  return `${y}/${m}/${j}`;
}

/**
 * Deplace les mails correspondant a la requete (et actuellement dans la boite
 * de reception) vers le label historique configure.
 *
 * @returns {Promise<{email, labelDestination, nbTrouves, nbDeplaces, nbIgnores, requete, dryRun, details}>}
 */
async function deplacerVersHistorique({ mode = 'test', requete, dryRun = false }) {
  if (!requete || !requete.trim()) {
    throw new Error('Requete de recherche vide — au moins un critere (objet ou date) est requis');
  }

  const { auth, email } = await creerClientAuthentifie(mode);
  const accessToken = auth.credentials.access_token;
  const nomLabelHistorique = await getLabelHistorique();

  const labelId = await resoudreOuCreerLabel(accessToken, nomLabelHistorique, dryRun);
  if (!labelId && !dryRun) {
    throw new Error(`Impossible de resoudre ou creer le label "${nomLabelHistorique}"`);
  }

  const messages = await listerTousLesMessages(accessToken, requete);

  let nbDeplaces = 0;
  let nbIgnores = 0;
  const details = [];

  for (const { id } of messages) {
    const msg = await requeteGmailApi(accessToken, `/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject`);
    const sujet = msg.payload?.headers?.find(h => h.name === 'Subject')?.value || '(sans objet)';
    const dansInbox = (msg.labelIds || []).includes('INBOX');

    if (!dansInbox) {
      nbIgnores++;
      details.push({ sujet, action: 'ignore' });
      continue;
    }

    if (!dryRun) {
      await requeteGmailApi(accessToken, `/gmail/v1/users/me/messages/${id}/modify`, {
        method: 'POST',
        body: { removeLabelIds: ['INBOX'], addLabelIds: [labelId] },
      });
    }
    nbDeplaces++;
    details.push({ sujet, action: 'deplace' });
  }

  return {
    email, labelDestination: nomLabelHistorique,
    nbTrouves: messages.length, nbDeplaces, nbIgnores,
    requete, dryRun, details,
  };
}

module.exports = { deplacerVersHistorique, construireRequete };
