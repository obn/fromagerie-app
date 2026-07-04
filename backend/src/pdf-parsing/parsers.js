/**
 * Parsers PDF par fournisseur.
 *
 * Chaque parser reçoit le texte brut extrait du PDF et retourne un objet :
 * {
 *   client: 'distral' | 'scapalyon' | 'logifresh',
 *   numeroCommande: string,
 *   dateCommande: 'YYYY-MM-DD' | null,
 *   dateLivraison: 'YYYY-MM-DD' | null,
 *   lignes: [
 *     {
 *       codeInterne: string | null,       // code du client ou ref fournisseur
 *       gencod: string | null,            // si le client envoie le gencod directement
 *       designationBrute: string,
 *       quantite: number | null,
 *       unite: string | null,
 *       certitude: 'haute' | 'a_verifier' | 'non_fiable',
 *       ligneBrute: string | null,        // texte brut en cas de chevauchement
 *     }
 *   ]
 * }
 */

const MOIS_FR = {
  janvier:1, février:2, fevrier:2, mars:3, avril:4, mai:5, juin:6,
  juillet:7, août:8, aout:8, septembre:9, octobre:10, novembre:11, décembre:12, decembre:12,
};

function parseDateFr(texte) {
  if (!texte) return null;
  // Format "18/06/26" ou "18/06/2026"
  const m1 = texte.match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (m1) {
    const [, j, mo, a] = m1;
    const annee = a.length === 2 ? '20' + a : a;
    return `${annee}-${mo.padStart(2,'0')}-${j.padStart(2,'0')}`;
  }
  // Format "mercredi 24 juin 2026"
  const m2 = texte.toLowerCase().match(/(\d{1,2})\s+([a-zéû]+)\s+(\d{4})/);
  if (m2) {
    const [, j, moisStr, a] = m2;
    const mo = MOIS_FR[moisStr];
    if (mo) return `${a}-${String(mo).padStart(2,'0')}-${j.padStart(2,'0')}`;
  }
  return null;
}

function parseQte(s) {
  const n = parseFloat(String(s).replace(',', '.'));
  return isNaN(n) ? null : n;
}

// ── DISTRAL ──────────────────────────────────────────────────────────────────
// Format reel du bon de commande PDF Distral (extrait via pdf-parse) :
//   Date de commande: 03/07/26
//   Date de livraison: 18/06/26
//   Code Votre réf. Intitulé Matière DLC minimum Quantité Commandée
//   Quantité en U Fact Prix Unitaire Montant
//
//   03066 FBE09 BOUCHON
//   7 EPICES
//   FERMIER
//   VRAC
//   5KGS
//   03/07/26 1 COL 5,000
//   KG
//   19,030
//   EUR
//   95,15
//
// -> code interne Distral (03066) + notre reference (FBE09) + designation
//    multi-lignes + DLC minimum + quantite commandee + unite colis +
//    quantite facturee + unite + prix + devise + montant.
function parserDistral(texte) {
  const lignes = [];

  // N° commande
  const mCmd = texte.match(/commande\s+fournisseur\s+(\d+)/i)
    || texte.match(/(?:commande|order)\s*n[°o]?\s*:?\s*(\d+)/i)
    || texte.match(/(\d{6,})/);
  const numeroCommande = mCmd ? mCmd[1] : 'INCONNU';

  // Dates
  const mDateCmd = texte.match(/date\s+(?:de\s+)?commande\s*:?\s*([0-9/]+)/i);
  const mDateLiv = texte.match(/date\s+(?:de\s+)?livraison\s*:?\s*([0-9/]+)/i)
    || texte.match(/livraison\s+(?:le\s+)?([0-9/]+)/i);

  // Le tableau produit commence juste apres la ligne d'en-tete de colonnes
  // ("...Prix Unitaire Montant"). Tout ce qui precede (adresse, contacts,
  // codes postaux) est ignore pour eviter les faux positifs.
  const idxDebutTableau = texte.search(/montant\s*\n/i);
  const zoneTableau = idxDebutTableau >= 0 ? texte.slice(idxDebutTableau) : texte;

  // Chaque bloc produit commence par le code interne Distral (4-6 chiffres).
  // La "votre ref" (notre code, ex: FBN08) qui suit est OPTIONNELLE — certains
  // envois Distral ne la fournissent pas pour toutes les lignes.
  const regBloc = /(\d{4,6})\s+([\s\S]*?)(?=\n?\d{4,6}\s|$)/g;
  let m;
  while ((m = regBloc.exec(zoneTableau)) !== null) {
    let blocRestant = m[2];

    // La "votre ref" suit un pattern strict lettres+chiffres (ex: FBN08, FBE09).
    // Un mot de designation comme "BOUCHON" (que des lettres, pas de chiffre)
    // ne doit JAMAIS etre confondu avec une reference.
    let votreRef = null;
    const mRef = blocRestant.match(/^([A-Z]{2,5}\d{1,4})\s+/);
    if (mRef) {
      votreRef = mRef[1];
      blocRestant = blocRestant.slice(mRef[0].length);
    }

    // Le reste contient : designation (plusieurs lignes) puis une ligne
    // "DLC_DATE  QUANTITE  UNITE  POIDS" qui marque la fin de la designation.
    const mDlcQte = blocRestant.match(/(\d{2}\/\d{2}\/\d{2})\s+(\d+(?:[.,]\d+)?)\s+(\w+)\s+([\d,]+)/);

    // Sans ce motif, le bloc capture n'est pas une vraie ligne produit (faux positif) — on l'ignore.
    if (!mDlcQte) continue;

    const designation = blocRestant.slice(0, mDlcQte.index).replace(/\s*\n\s*/g, ' ').trim();
    const poidsFacture = parseQte(mDlcQte[4]); // ex: 5,000 (kg factures)
    const quantiteColis = parseQte(mDlcQte[2]);
    const uniteColis = mDlcQte[3]; // ex: COL

    if (!designation) continue;

    lignes.push({
      codeInterne: votreRef, // null si absente du PDF -> deduite plus tard par rapprochement de libelle
      gencod: null,
      designationBrute: designation,
      // Le poids facture (KG) est plus parlant en production que le nombre de colis
      quantite: poidsFacture ?? quantiteColis,
      unite: poidsFacture ? 'KG' : uniteColis,
      // Certitude "a_verifier" (au lieu de "haute") quand la reference est absente :
      // la ligne repose alors sur une deduction texte, a confirmer manuellement.
      certitude: votreRef ? 'haute' : 'a_verifier',
      ligneBrute: m[0].trim(),
    });
  }

  // Mode degrade si aucun bloc reconnu (format totalement different)
  if (lignes.length === 0) {
    for (const ligne of texte.split('\n')) {
      const l = ligne.trim();
      if (l.length > 5) {
        lignes.push({
          codeInterne: null, gencod: null,
          designationBrute: l, quantite: null, unite: null,
          certitude: 'a_verifier', ligneBrute: l,
        });
      }
    }
  }

  return {
    client: 'distral',
    numeroCommande,
    dateCommande: parseDateFr(mDateCmd?.[1]),
    dateLivraison: parseDateFr(mDateLiv?.[1]),
    lignes,
  };
}

// ── SCAPALYON ────────────────────────────────────────────────────────────────
function parserScapalyon(texte) {
  const lignes = [];

  const mCmd = texte.match(/BCF\d+/);
  const numeroCommande = mCmd ? mCmd[0] : 'INCONNU';

  // Date de livraison : "mercredi 24 juin 2026" ou "24/06/2026"
  const mDateLiv = texte.match(/((?:lundi|mardi|mercredi|jeudi|vendredi)\s+\d+\s+\w+\s+\d{4})/i)
    || texte.match(/livraison\s*:?\s*([0-9/]+)/i);

  // Lignes : code numérique + quantité + unité + désignation
  // Ex: "3244   12   Kg   PETIT FRAIS..."
  const regLigne = /^(\d{4,6})\s+(\d+(?:[.,]\d+)?)\s+(Kg|KG|kg|pièce|piece|Pièce|l|L)?\s*(.+)$/gm;
  let m;
  while ((m = regLigne.exec(texte)) !== null) {
    const des = m[4].trim();
    if (!des || des.toUpperCase() === 'VEUILLEZ' || des.length < 3) continue;
    // Détecter chevauchement ("Veuillez" seul = ligne incomplète)
    const certitude = des.toLowerCase().startsWith('veuillez') ? 'non_fiable' : 'a_verifier';
    lignes.push({
      codeInterne: m[1],
      gencod: null,
      designationBrute: certitude === 'non_fiable' ? null : des,
      quantite: parseQte(m[2]),
      unite: m[3] || null,
      certitude,
      ligneBrute: m[0].trim(),
    });
  }

  // Lignes brutes avec "Veuillez" (chevauchement connu)
  const regVeuillez = /^(\d{4,6})\s+Veuillez\s*(.*)$/gm;
  while ((m = regVeuillez.exec(texte)) !== null) {
    if (!lignes.find(l => l.codeInterne === m[1])) {
      lignes.push({
        codeInterne: m[1], gencod: null,
        designationBrute: null, quantite: null, unite: null,
        certitude: 'non_fiable', ligneBrute: m[0].trim(),
      });
    }
  }

  return {
    client: 'scapalyon',
    numeroCommande,
    dateCommande: null,
    dateLivraison: parseDateFr(mDateLiv?.[1] || mDateLiv?.[0]),
    lignes,
  };
}

// ── LOGIFRESH ────────────────────────────────────────────────────────────────
function parserLogifresh(texte) {
  const lignes = [];

  const mCmd = texte.match(/(?:commande|bon)\s*(?:n[°o])?\s*:?\s*(\d+)/i);
  const numeroCommande = mCmd ? mCmd[1] : 'INCONNU';

  const mDate = texte.match(/(\d{2}\/\d{2}\/\d{4})/);

  // Logifresh envoie des refs fournisseur longues (7 chiffres) + quantité + désignation
  const regLigne = /^(\d{7})\s+(\d+(?:[.,]\d+)?)\s+(.+)$/gm;
  let m;
  while ((m = regLigne.exec(texte)) !== null) {
    const des = m[3].trim();
    if (!des || des.length < 3) continue;
    lignes.push({
      codeInterne: m[1],   // ref fournisseur, à résoudre via codes_internes
      gencod: null,
      designationBrute: des,
      quantite: parseQte(m[2]),
      unite: null,
      certitude: 'a_verifier',
      ligneBrute: m[0].trim(),
    });
  }

  return {
    client: 'logifresh',
    numeroCommande,
    dateCommande: parseDateFr(mDate?.[1]),
    dateLivraison: parseDateFr(mDate?.[1]),
    lignes,
  };
}

// ── AUTO-DÉTECTION ────────────────────────────────────────────────────────────
function detecterFournisseur(texte, nomFichier = '') {
  const t = texte.toLowerCase();
  const f = nomFichier.toLowerCase();
  if (t.includes('distral') || f.includes('distral')) return 'distral';
  if (t.includes('scapalyon') || t.includes('bcf') || f.includes('scapalyon')) return 'scapalyon';
  if (t.includes('logifresh') || f.includes('logifresh')) return 'logifresh';
  return null;
}

function parserPdf(texte, nomFichier = '') {
  const fournisseur = detecterFournisseur(texte, nomFichier);
  if (fournisseur === 'distral')   return parserDistral(texte);
  if (fournisseur === 'scapalyon') return parserScapalyon(texte);
  if (fournisseur === 'logifresh') return parserLogifresh(texte);

  // Fournisseur inconnu — retourner les lignes brutes avec certitude nulle
  console.warn(`[parser] Fournisseur non identifié pour "${nomFichier}" — mode brut`);
  return {
    client: null,
    numeroCommande: 'INCONNU',
    dateCommande: null,
    dateLivraison: null,
    lignes: texte.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 3)
      .map(l => ({
        codeInterne: null, gencod: null,
        designationBrute: l, quantite: null, unite: null,
        certitude: 'non_fiable', ligneBrute: l,
      })),
  };
}

module.exports = { parserPdf, parserDistral, parserScapalyon, parserLogifresh, detecterFournisseur, parseDateFr };