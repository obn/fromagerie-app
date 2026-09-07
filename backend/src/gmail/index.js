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
const { chargerParseursActifs, trouverParseurCorrespondant, appliquerParseurConfigure } = require('../pdf-parsing/parseur-generique');
const knex = require('../db/knex');

const LABEL_PAR_DEFAUT = 'commandes validées';
const LABEL_HISTORIQUE_PAR_DEFAUT = 'Commandes/commandes historisées';

async function getParametre(cle, defaut) {
  try {
    const param = await knex('parametres').where({ cle }).first();
    return param?.valeur || defaut;
  } catch (e) {
    return defaut;
  }
}

const getLabelCommandes = () => getParametre('gmail_label_commandes', LABEL_PAR_DEFAUT);
const getLabelHistorique = () => getParametre('gmail_label_commandes_historisees', LABEL_HISTORIQUE_PAR_DEFAUT);

async function resoudreLabelId(accessToken, nomLabel) {
  const res = await requeteGmailApi(accessToken, '/gmail/v1/users/me/labels');
  const labels = res.labels || [];
  const label = labels.find(l => l.name.toLowerCase() === nomLabel.toLowerCase());
  if (!label) {
    throw new Error(`Label Gmail "${nomLabel}" introuvable. Labels disponibles : ${labels.map(l => l.name).join(', ')}`);
  }
  return label.id;
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

  return { pieces: resultat, internalDate: msg.internalDate || null };
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
    const { pieces: piecesJointes, internalDate } = await extrairePiecesJointes(accessToken, messageId);
    const dateReceptionCalculee = internalDate
      ? (() => {
          const d = new Date(Number(internalDate));
          if (Number.isNaN(d.getTime())) return null;
          const offset = d.getTimezoneOffset();
          return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
        })()
      : null;

    if (piecesJointes.length === 0) {
      rapport.erreurs.push('Aucune pièce jointe PDF trouvée');
      return rapport;
    }

    for (const { filename, buffer } of piecesJointes) {
      try {
        const pdfData = await pdfParse(buffer);
        console.log('[DEBUG texte PDF]', JSON.stringify(pdfData.text));

        // tenter d'abord le parseur générique configurable
        const parseursActifs = await chargerParseursActifs();
        const parseurConfigure = trouverParseurCorrespondant(pdfData.text, filename, parseursActifs);

        let commande;
        if (parseurConfigure) {
          commande = await  appliquerParseurConfigure(pdfData.text, parseurConfigure);
        } else {
          commande = await parserPdf(pdfData.text, filename);

          // Fournisseur non reconnu par aucun parseur configure -> dernier recours via IA
          /*
            if (!commande.client) {
              try {
                const { parserPdfAvecIA } = require('../pdf-parsing/parser-ia');
                commande = await parserPdfAvecIA(buffer, filename);
              } catch (e) {
                console.error(`[gmail] Echec extraction IA pour "${filename}" : ${e.message}`);
                // commande reste celle du mode brut (client=null), traitee comme avant
              }
            }*/
        }

        if (!commande.client) {
          rapport.pdfs.push({ filename, statut: 'fournisseur_inconnu', commande });
          continue;
        }

        const res = await insererCommande(commande, { gmailMessageId: messageId, dateReceptionMail: dateReceptionCalculee });
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

function resumerRapports(rapports) {
  const nbInseres  = rapports.flatMap(r => r.pdfs).filter(p => p.statut === 'insere').length;
  const nbDoublons = rapports.flatMap(r => r.pdfs).filter(p => p.statut === 'doublon').length;
  const nbErreurs  = rapports.flatMap(r => r.erreurs).length;
  return { nbInseres, nbDoublons, nbErreurs };
}

// ── Sync standard : mails NON LUS du label "commandes validees" ──────────────
async function syncGmail(modeForce = null) {
  const { auth, mode, email } = await creerClientAuthentifie(modeForce);
  const accessToken = auth.credentials.access_token;

  const nomLabel = await getLabelCommandes();
  console.log(`[gmail] Sync mode="${mode}" (${email}), label="${nomLabel}"`);

  await resoudreLabelId(accessToken, nomLabel);

  const messages = await listerTousLesMessages(accessToken, `label:"${nomLabel}" is:unread`);
  console.log(`[gmail] ${messages.length} mail(s) non lu(s)`);

  const rapports = [];
  for (const { id } of messages) {
    rapports.push(await traiterMessage(accessToken, id));
  }

  const { nbInseres, nbDoublons, nbErreurs } = resumerRapports(rapports);
  console.log(`[gmail] Terminé — ${nbInseres} insérée(s), ${nbDoublons} doublon(s), ${nbErreurs} erreur(s)`);

  return { mode, email, nbMessages: messages.length, nbInseres, nbDoublons, nbErreurs, rapports };
}

// ── Traitement de l'historique : TOUS les mails du label historique ──────────
// (deja lus pour la plupart, deplaces via la carte "Deplacer les mails
// historiques" de la page Parametres) — traites par lots en parallele car
// le volume peut etre important (import massif d'un mois/annee entier).
async function traiterHistorique(modeForce = null) {
  const { auth, mode, email } = await creerClientAuthentifie(modeForce);
  const accessToken = auth.credentials.access_token;

  const nomLabel = await getLabelHistorique();
  console.log(`[gmail] Traitement historique mode="${mode}" (${email}), label="${nomLabel}"`);

  await resoudreLabelId(accessToken, nomLabel);

  // Seuls les mails NON LUS sont traites : ceux deja lus ont deja ete
  // importes lors d'un traitement precedent (idempotence, evite les doublons
  // de traitement meme si le bouton est clique plusieurs fois).
  const messages = await listerTousLesMessages(accessToken, `label:"${nomLabel}" is:unread`);
  console.log(`[gmail] ${messages.length} mail(s) non lu(s) dans l'historique`);

  const TAILLE_LOT = 8;
  const rapports = [];
  for (let i = 0; i < messages.length; i += TAILLE_LOT) {
    const lot = messages.slice(i, i + TAILLE_LOT);
    const rapportsLot = await Promise.all(lot.map(({ id }) => traiterMessage(accessToken, id)));
    rapports.push(...rapportsLot);
  }

  const { nbInseres, nbDoublons, nbErreurs } = resumerRapports(rapports);
  console.log(`[gmail] Historique terminé — ${nbInseres} insérée(s), ${nbDoublons} doublon(s), ${nbErreurs} erreur(s)`);

  return { mode, email, labelHistorique: nomLabel, nbMessages: messages.length, nbInseres, nbDoublons, nbErreurs, rapports };
}

module.exports = { syncGmail, traiterHistorique };