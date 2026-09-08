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

/// ── DISTRAL ──────────────────────────────────────────────────────────────────
 // Format du bon de commande PDF Distral. Le texte extrait par pdf-parse varie
 // selon les envois : parfois multi-lignes avec espaces ("03064 FBN08 BOUCHON\n
 // NATURE\n..."), parfois totalement colle sans aucun separateur
 // ("03064FBN08BOUCHON NATURE VRAC 5KG25/09/2614 COL70,000 KG17,190 EUR1 203,30").
 //
 // Plutot que de decouper d'abord en "blocs" (ambigu quand tout est colle — la
 // quantite+unite peut ressembler a un nouveau code produit), on capture
 // directement CHAQUE ligne produit en UNE seule regex globale, ancree sur les
 // marqueurs fiables et non-ambigus du format : date DD/MM/YY, unites en
 // MAJUSCULES (COL, KG), nombres a virgule. Fonctionne pour les deux variantes
 // (espacee et colle) car tous les separateurs sont en \s* (zero ou plus).
 function parserDistral(texte) {
   const lignes = [];

   const mCmd = texte.match(/commande\s+fournisseur\s+(\d+)/i)
     || texte.match(/(?:commande|order)\s*n[°o]?\s*:?\s*(\d+)/i)
     || texte.match(/(\d{6,})/);
   const numeroCommande = mCmd ? mCmd[1] : 'INCONNU';

   const mDateCmd = texte.match(/date\s+(?:de\s+)?commande\s*:?\s*([0-9/]+)/i);
   const mDateLiv = texte.match(/date\s+(?:de\s+)?livraison\s*:?\s*([0-9/]+)/i)
     || texte.match(/livraison\s+(?:le\s+)?([0-9/]+)/i);

   const idxDebutTableau = texte.search(/montant/i);
   const zoneTableau = idxDebutTableau >= 0 ? texte.slice(idxDebutTableau) : texte;

   // Capture directe et complete de chaque ligne produit :
   // code fournisseur (4-6 chiffres) + votre ref optionnelle (lettres+chiffres)
   // + designation (lazy, jusqu'a la DLC) + DLC + quantite commandee + unite
   // colis + poids facture + unite poids.
   const regLigne = /(\d{4,6})\s*([A-Z]{2,5}\d{1,4})?\s*([\s\S]*?)(\d{2}\/\d{2}\/\d{2})\s*(\d+(?:[.,]\d+)?)\s*([A-Z]+)\s*([\d,]+)\s*([A-Z]+)/g;

   let m;
   while ((m = regLigne.exec(zoneTableau)) !== null) {
     const votreRef = m[2] || null;
     const designation = m[3].replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
     const quantiteColis = parseQte(m[5]);
     const uniteColis = m[6];
     const poidsFacture = parseQte(m[7]);

     if (!designation) continue;

     lignes.push({
       codeInterne: votreRef, // null si absente -> deduite plus tard par rapprochement de libelle
       gencod: null,
       designationBrute: designation,
       // Le poids facture (KG) est plus parlant en production que le nombre de colis
       quantite: poidsFacture ?? quantiteColis,
       unite: poidsFacture ? 'KG' : uniteColis,
       certitude: votreRef ? 'haute' : 'a_verifier',
       ligneBrute: m[0].trim(),
     });
   }

   // Mode degrade si aucune ligne reconnue (format totalement different)
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
// Format "Synthese globale des achats" / bon de commande plateforme Logifresh.
// PDF de 2 pages : la page 1 ("Synthese globale") peut potentiellement agreger
// PLUSIEURS commandes distinctes — on parse donc exclusivement la PAGE 2
// ("No commande : XXXXXX"), qui correspond a UNE seule commande identifiee.
//
// Extraction en mode COLONNE (pas en blocs par produit comme les autres
// fournisseurs) : le texte liste d'abord TOUS les codes produits, puis TOUTES
// les designations, puis TOUTES les quantites — dans le meme ordre. On les
// recombine par position (1er code <-> 1ere designation <-> 1ere quantite).
//
// Pattern reel observe (texte pdf-parse, ligne par ligne apres "No commande") :
//   2932800                                  <- codes (6-8 chiffres), N lignes
//   2934300
//   3744600
//   BOUCHON BIO APERO 7 EPICES PCB 10        <- designations, chacune se termine
//   FE STK                                      par le marqueur "STK"
//   BOUCHON BIO APERO VIN BLANC PCB
//   10 FE STK
//   REGAL S/SOUCI BIO FERMIER 200G
//   PCB 6 FE STK
//   20                                        <- quantites, N premieres lignes
//   35                                           purement numeriques rencontrees
//   5                                            (le reste du bloc — poids, prix,
//   0.100                                        unites, totaux — est ignore)
//   ...
//   60                                        <- ATTENTION : ceci est un total
//   TOTAL COMMANDE                               recapitulatif, pas une 4e quantite
//                                                 (exclu car on s'arrete a N=3)
function parserLogifresh(texte) {
  // Client + numero de compte (fiables, presents sur les 2 pages)
  const mClient = texte.match(/CLIENT\s+(\S+)\s+(\d+)/);
  const clientBrut = mClient?.[1] || null;
  const numeroCommande = mClient?.[2] || 'INCONNU';

  // Date de reception/livraison prevue (la seule date non ambigue du document ;
  // le "Date commande" n'a pas de valeur distincte fiable dans ce format —
  // laissee a null plutot que de deviner).
  const mDateLiv = texte.match(/Date\s+récep\.\s+prév\s*:[\s\S]*?(\d{2}\/\d{2}\/\d{4})/i);
  const dateLivraison = mDateLiv ? convertirDate(mDateLiv[1]) : null;

  // Page 2 = "No commande : XXXXXX", identifie UNE seule commande (contrairement
  // a la page 1 "Synthese globale" qui pourrait en agreger plusieurs)
  const idxPage2 = texte.lastIndexOf('No commande');
  const zoneTexte = idxPage2 >= 0 ? texte.slice(idxPage2) : texte;
  const lignesTexte = zoneTexte.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let i = 0;
  while (i < lignesTexte.length && !/^\d{6,8}$/.test(lignesTexte[i])) i++;
  const codes = [];
  while (i < lignesTexte.length && /^\d{6,8}$/.test(lignesTexte[i])) {
    codes.push(lignesTexte[i]);
    i++;
  }
  const n = codes.length;

  const designations = [];
  let courant = [];
  while (i < lignesTexte.length && designations.length < n) {
    courant.push(lignesTexte[i]);
    if (lignesTexte[i].includes('STK')) {
      const texteDesignation = courant.join(' ')
        .replace(/\bSTK\b/, '')
        .replace(/\bFE\b\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim();
      designations.push(texteDesignation);
      courant = [];
    }
    i++;
  }

  const quantites = [];
  while (i < lignesTexte.length && quantites.length < n) {
    if (/^\d+$/.test(lignesTexte[i])) quantites.push(parseInt(lignesTexte[i], 10));
    i++;
  }

  const lignes = codes.map((code, idx) => {
    const designation = designations[idx] || null;
    if (!designation) return null;
    return {
      codeInterne: code,
      gencod: null,
      designationBrute: designation,
      quantite: quantites[idx] ?? null,
      unite: null,
      certitude: 'a_verifier', // extraction colonne recente, prudence par defaut
      ligneBrute: `${code} | ${designation} | qte:${quantites[idx]}`,
    };
  }).filter(Boolean);

  return {
    client: clientBrut, // resolu ensuite via nom OU nom_facture (ex: LOGIFRESH -> AUCHAN)
    numeroCommande,
    dateCommande: null,
    dateLivraison,
    lignes,
  };
}

function convertirDate(dateStr) {
  const m = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const [, j, mo, a] = m;
  return `${a}-${mo}-${j}`;
}

async function parserChezAndre(texte) {
  const { resoudreClientParLibelle } = require('./parseur-generique');

  // N° commande
  const mCmd = texte.match(/Bon\s+de\s+Commande\s+N[°o]?(\d+)/i);
  const numeroCommande = mCmd ? mCmd[1] : 'INCONNU';

  // Dates (format DD/MM/YYYY complet)
  const mDateCmd = texte.match(/Date\s*:\s*(\d{2}\/\d{2}\/\d{4})/);
  const mDateLiv = texte.match(/centralisation\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);

  // Client dynamique : magasin indique dans "Site de livraison"
  const mClient = texte.match(/Site\s+de\s+livraison[\s\S]*?\n([A-ZÀ-Ÿ][A-ZÀ-Ÿ\s\-]+)\n/);
  const texteClientBrut = mClient?.[1]?.trim();
  const client = texteClientBrut ? await resoudreClientParLibelle(texteClientBrut) : null;

  // ── Scan par blocs pour les lignes produit ──────────────────────────────
  const lignesTexte = texte.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const idxDebut = lignesTexte.findIndex(l => l.includes('PièceColis'));
  const zone = idxDebut >= 0 ? lignesTexte.slice(idxDebut + 1) : lignesTexte;

  const lignes = [];
  let i = 0;
  while (i < zone.length) {
    const ligne = zone[i];
    const mDebutBloc = ligne.match(/^(\d{4,6})([A-Z0-9]*)$/);
    if (!mDebutBloc) { i++; continue; }

    const plu = mDebutBloc[1];
    const pluFrn = mDebutBloc[2] || null;

    const designationParts = [];
    let j = i + 1;
    while (j < zone.length && !/^\d+$/.test(zone[j])) {
      designationParts.push(zone[j]);
      j++;
    }
    if (j >= zone.length) break; // format inattendu — on arrete le scan

    const ligneNum2 = zone[j + 1]; // Piece + Colis colles
    const colis = ligneNum2 ? parseInt(ligneNum2.slice(-1), 10) : null;

    const designation = designationParts
      .join(' ')
      .replace(/\u0000/g, '-') // caractere special mal encode -> tiret
      .replace(/\s+/g, ' ')
      .trim();

    if (designation) {
      lignes.push({
        codeInterne: pluFrn, // reference interne producteur (ex: FBE055) — plus utile que le PLU magasin
        gencod: null,
        designationBrute: designation,
        quantite: colis,
        unite: 'colis',
        certitude: 'a_verifier', // parsing recent, prudence par defaut
        ligneBrute: `${plu}${pluFrn || ''} ${designation}`,
      });
    }

    i = j + 2; // saute les 2 lignes numeriques, passe au bloc suivant
  }

  return {
    client,
    numeroCommande,
    dateCommande: mDateCmd ? convertirDate(mDateCmd[1]) : null,
    dateLivraison: mDateLiv ? convertirDate(mDateLiv[1]) : null,
    lignes,
  };
}

function convertirDate(dateStr) {
  const m = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const [, j, mo, a] = m;
  return `${a}-${mo}-${j}`;
}


// ── AUTO-DÉTECTION ────────────────────────────────────────────────────────────
function detecterFournisseur(texte, nomFichier = '') {
  const t = texte.toLowerCase();
  const f = nomFichier.toLowerCase();
  if (t.includes('distral') || f.includes('distral')) return 'distral';
  if (t.includes('scapalyon') || t.includes('bcf') || f.includes('scapalyon')) return 'scapalyon';
  if (t.includes('logifresh') || f.includes('logifresh')) return 'logifresh';
  if (t.includes('total colis') || f.toLowerCase().includes('bon_de_commande')) return 'chez_andre';
  return null;
}

async function parserPdf(texte, nomFichier = '') {
  const fournisseur = detecterFournisseur(texte, nomFichier);
  if (fournisseur === 'distral')    return parserDistral(texte);
  if (fournisseur === 'scapalyon')  return parserScapalyon(texte);
  if (fournisseur === 'logifresh')  return parserLogifresh(texte);
  if (fournisseur === 'chez_andre') return await parserChezAndre(texte);


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

module.exports = { parserPdf, parserDistral, parserScapalyon, parserLogifresh, parserChezAndre, detecterFournisseur, parseDateFr };