/**
 * Module de récupération des commandes depuis Gmail.
 *
 * Flux :
 * 1. Se connecte à Gmail via OAuth2
 * 2. Cherche les mails non lus du label configuré (GMAIL_LABEL_COMMANDES)
 * 3. Pour chaque mail → extrait les pièces jointes PDF
 * 4. Parse chaque PDF (détection fournisseur automatique)
 * 5. Insère commande + lignes en base
 * 6. Marque le mail comme lu (évite le re-traitement)
 *
 * Appelé :
 * - Manuellement via POST /api/gmail/sync
 * - Automatiquement toutes les X minutes (cron, configurable via parametre DB)
 */

require('dotenv').config();
const { google } = require('googleapis');
const pdfParse = require('pdf-parse');
const { creerClientAuthentifie } = require('./auth');
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

// ── Résolution de l'ID du label Gmail par son nom ───────────────────────────
async function resoudreLabelId(gmail, nomLabel) {
  const res = await gmail.users.labels.list({ userId: 'me' });
  const labels = res.data.labels || [];
  const label = labels.find(l => l.name.toLowerCase() === nomLabel.toLowerCase());
  if (!label) throw new Error(`Label Gmail "${nomLabel}" introuvable. Labels disponibles : ${labels.map(l => l.name).join(', ')}`);
  return label.id;
}

// ── Extraction des pièces jointes PDF d'un message ──────────────────────────
async function extrairePiecesJointes(gmail, messageId) {
  const msg = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
  const pieces = [];

  function parcourirParts(parts = []) {
    for (const part of parts) {
      if (part.parts) parcourirParts(part.parts);
      if (part.mimeType === 'application/pdf' || (part.filename && part.filename.toLowerCase().endsWith('.pdf'))) {
        pieces.push({ filename: part.filename, attachmentId: part.body?.attachmentId, data: part.body?.data });
      }
    }
  }

  parcourirParts(msg.data.payload?.parts || [msg.data.payload]);

  // Télécharger les pièces jointes par ID si nécessaire
  const resultat = [];
  for (const piece of pieces) {
    let buffer;
    if (piece.data) {
      buffer = Buffer.from(piece.data, 'base64');
    } else if (piece.attachmentId) {
      const att = await gmail.users.messages.attachments.get({
        userId: 'me', messageId, id: piece.attachmentId,
      });
      buffer = Buffer.from(att.data.data, 'base64');
    }
    if (buffer) resultat.push({ filename: piece.filename || 'commande.pdf', buffer });
  }

  return resultat;
}

// ── Traitement d'un seul message ─────────────────────────────────────────────
async function traiterMessage(gmail, messageId) {
  const rapport = { messageId, pdfs: [], erreurs: [] };

  try {
    const piecesJointes = await extrairePiecesJointes(gmail, messageId);

    if (piecesJointes.length === 0) {
      rapport.erreurs.push('Aucune pièce jointe PDF trouvée dans ce mail');
      return rapport;
    }

    for (const { filename, buffer } of piecesJointes) {
      try {
        const pdfData = await pdfParse(buffer);
        const texte = pdfData.text;
        const commande = parserPdf(texte, filename);

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

    // Marquer le mail comme lu une fois tous les PDFs traités
    const tousTrouves = rapport.pdfs.some(p => p.statut === 'insere' || p.statut === 'doublon');
    if (tousTrouves) {
      await gmail.users.messages.modify({
        userId: 'me', id: messageId,
        requestBody: { removeLabelIds: ['UNREAD'] },
      });
    }
  } catch (e) {
    rapport.erreurs.push(e.message);
  }

  return rapport;
}

// ── Sync principale ───────────────────────────────────────────────────────────
async function syncGmail() {
  const auth = creerClientAuthentifie();
  const gmail = google.gmail({ version: 'v1', auth });
  const rapports = [];

  const nomLabel = await getLabelCommandes();
  console.log(`[gmail] Sync du label "${nomLabel}"…`);

  let labelId;
  try {
    labelId = await resoudreLabelId(gmail, nomLabel);
  } catch (e) {
    throw new Error(`[gmail] ${e.message}`);
  }

  // Cherche les mails non lus du label
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: `label:"${nomLabel}" is:unread`,
    maxResults: 20,
  });

  const messages = res.data.messages || [];
  console.log(`[gmail] ${messages.length} mail(s) non lu(s) trouvé(s)`);

  for (const { id } of messages) {
    const rapport = await traiterMessage(gmail, id);
    rapports.push(rapport);
  }

  const nbInseres = rapports.flatMap(r => r.pdfs).filter(p => p.statut === 'insere').length;
  const nbDoublons = rapports.flatMap(r => r.pdfs).filter(p => p.statut === 'doublon').length;
  const nbErreurs = rapports.flatMap(r => r.erreurs).length;

  console.log(`[gmail] Sync terminée — ${nbInseres} commande(s) insérée(s), ${nbDoublons} doublon(s), ${nbErreurs} erreur(s)`);

  return { nbMessages: messages.length, nbInseres, nbDoublons, nbErreurs, rapports };
}

module.exports = { syncGmail };
