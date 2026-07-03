/**
 * Module principal Gmail : sync des commandes depuis les mails.
 *
 * IMPORTANT : n'utilise PAS le client googleapis pour les appels réseau
 * (gaxios/fetch plante avec "Premature close" sur Railway). Tous les appels
 * passent par requeteGmailApi() qui utilise le module https natif de Node.
 */

require('dotenv').config();
const pdfParse = require('pdf-parse');
const { creerClientAuthentifie, requeteGmailApi } = require('./auth');
const { parserPdf } = require('../pdf-parsing/parsers');
const { insererCommande } = require('../pdf-parsing/inserer-commande');
const knex = require('../db/knex');

const LABEL_PAR_DEFAUT = 'commandes validées';

async function getLabelCommandes() {
  try {
    const param = await knex('parametres').where({ cle: 'gmail_label_commandes' }).first();
    return param?.valeur || LABEL_PAR_DEFAUT;
  } catch (e) {
    return LABEL_PAR_DEFAUT;
  }
}

async function resoudreLabelId(accessToken, nomLabel) {
  const res = await requeteGmailApi(accessToken, '/gmail/v1/users/me/labels');
  const labels = res.labels || [];
  const label = labels.find(l => l.name.toLowerCase() === nomLabel.toLowerCase());
  if (!label) {
    throw new Error(`Label Gmail "${nomLabel}" introuvable. Labels disponibles : ${labels.map(l => l.name).join(', ')}`);
  }
  return label.id;
}

async function extrairePiecesJointes(accessToken, messageId) {
  const msg = await requeteGmailApi(accessToken, `/gmail/v1/users/me/messages/${messageId}?format=full`);
  const pieces = [];

  function parcourirParts(parts = []) {
    for (const part of parts) {
      if (part.parts) parcourirParts(part.parts);
      if (
        part.mimeType === 'application/pdf' ||
        (part.filename && part.filename.toLowerCase().endsWith('.pdf'))
      ) {
        pieces.push({
          filename: part.filename || 'commande.pdf',
          attachmentId: part.body?.attachmentId,
          data: part.body?.data,
        });
      }
    }
  }

  parcourirParts(msg.payload?.parts || [msg.payload]);

  const resultat = [];
  for (const piece of pieces) {
    let base64Data = piece.data;
    if (!base64Data && piece.attachmentId) {
      const att = await requeteGmailApi(
        accessToken,
        `/gmail/v1/users/me/messages/${messageId}/attachments/${piece.attachmentId}`
      );
      base64Data = att.data;
    }
    if (base64Data) {
      // Gmail utilise du base64url — le convertir en base64 standard
      const normalise = base64Data.replace(/-/g, '+').replace(/_/g, '/');
      resultat.push({ filename: piece.filename, buffer: Buffer.from(normalise, 'base64') });
    }
  }

  return resultat;
}

async function marquerCommeLu(accessToken, messageId) {
  await requeteGmailApi(accessToken, `/gmail/v1/users/me/messages/${messageId}/modify`, {
    method: 'POST',
    body: { removeLabelIds: ['UNREAD'] },
  });
}

async function traiterMessage(accessToken, messageId) {
  const rapport = { messageId, pdfs: [], erreurs: [] };

  try {
    const piecesJointes = await extrairePiecesJointes(accessToken, messageId);

    if (piecesJointes.length === 0) {
      rapport.erreurs.push('Aucune pièce jointe PDF trouvée');
      return rapport;
    }

    for (const { filename, buffer } of piecesJointes) {
      try {
        const pdfData = await pdfParse(buffer);
        const commande = parserPdf(pdfData.text, filename);

        if (!commande.client) {
          rapport.pdfs.push({ filename, statut: 'fournisseur_inconnu', commande });
          continue;
        }

        const res = await insererCommande(commande, { gmailMessageId: messageId });
        rapport.pdfs.push({ filename, statut: res.doublon ? 'doublon' : 'insere', ...res });
      } catch (e) {
        rapport.erreurs.push(`${filename} : ${e.message}`);
      }
    }

    const traite = rapport.pdfs.some(p => ['insere', 'doublon'].includes(p.statut));
    if (traite) {
      await marquerCommeLu(accessToken, messageId);
    }
  } catch (e) {
    rapport.erreurs.push(e.message);
  }

  return rapport;
}

async function syncGmail(modeForce = null) {
  const { auth, mode, email } = await creerClientAuthentifie(modeForce);
  const accessToken = auth.credentials.access_token;

  const nomLabel = await getLabelCommandes();
  console.log(`[gmail] Sync mode="${mode}" (${email}), label="${nomLabel}"`);

  await resoudreLabelId(accessToken, nomLabel);

  const q = encodeURIComponent(`label:"${nomLabel}" is:unread`);
  const res = await requeteGmailApi(accessToken, `/gmail/v1/users/me/messages?q=${q}&maxResults=20`);

  const messages = res.messages || [];
  console.log(`[gmail] ${messages.length} mail(s) non lu(s)`);

  const rapports = [];
  for (const { id } of messages) {
    rapports.push(await traiterMessage(accessToken, id));
  }

  const nbInseres  = rapports.flatMap(r => r.pdfs).filter(p => p.statut === 'insere').length;
  const nbDoublons = rapports.flatMap(r => r.pdfs).filter(p => p.statut === 'doublon').length;
  const nbErreurs  = rapports.flatMap(r => r.erreurs).length;

  console.log(`[gmail] Terminé — ${nbInseres} insérée(s), ${nbDoublons} doublon(s), ${nbErreurs} erreur(s)`);

  return { mode, email, nbMessages: messages.length, nbInseres, nbDoublons, nbErreurs, rapports };
}

module.exports = { syncGmail };