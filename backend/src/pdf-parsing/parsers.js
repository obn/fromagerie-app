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
// Format bon de commande PDF Scapalyon. REMPLACE l'ancien parser (base sur
// une regex de texte lineaire simple), incompatible avec le vrai format reel
// ou un texte d'avertissement ("Veuillez impérativement nous envoyer...")
// s'entrelace AU MILIEU de chaque ligne produit, rendant le texte pdf-parse
// lineaire totalement ambigu (numeros et texte imbriques sans ordre logique).
//
// Comme Perrier / Le Relais Local, extraction par POSITION X REELLE
// (pdfjs-dist) — le texte parasite "Veuillez..." est filtre par sa position
// X propre (x≈64), distincte de la colonne designation (x≈100-320).
//
// Le PCB n'est pas donne directement mais SE CALCULE : Qte / Nbre Colis
// (verifie exact sur le cas reel : coherent avec les mentions "X1"/"X6" deja
// visibles dans les designations elles-memes).
async function parserScapalyon(buffer) {
  const pdfParse = require('pdf-parse');
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

  // ── En-tete : via pdf-parse (texte lineaire, propre pour ces champs) ──────
  const dataTexte = await pdfParse(buffer);
  const texte = dataTexte.text;

  const mCmd = texte.match(/BCF\d+/);
  const numeroCommande = mCmd ? mCmd[0] : 'INCONNU';

  const mDateLiv = texte.match(/((?:lundi|mardi|mercredi|jeudi|vendredi)\s+\d+\s+\w+\s+\d{4})/i);

  // ── Lignes produit : via pdfjs-dist (positions X reelles) ─────────────────
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();

  const items = content.items
    .map(it => ({ x: Math.round(it.transform[4]), y: Math.round(it.transform[5]), texte: it.str }))
    .filter(it => it.texte.trim());

  const lignesParY = {};
  for (const it of items) {
    const yKey = Math.round(it.y / 2) * 2;
    lignesParY[yKey] = lignesParY[yKey] || [];
    lignesParY[yKey].push(it);
  }
  const ys = Object.keys(lignesParY).map(Number).sort((a, b) => b - a);

  const pivots = [];
  for (const y of ys) {
    const mots = lignesParY[y];
    const refItem = mots.find(m => /^\d{4}$/.test(m.texte) && m.x < 30);
    if (refItem) pivots.push({ y, reference: refItem.texte });
  }

  const lignes = [];
  for (let i = 0; i < pivots.length; i++) {
    const p = pivots[i];
    const yMax = pivots[i - 1] ? (p.y + pivots[i - 1].y) / 2 : p.y + 15;
    const yMin = pivots[i + 1] ? (p.y + pivots[i + 1].y) / 2 : p.y - 15;

    const motsFenetre = [];
    for (const y of ys) {
      if (y >= yMax) continue;
      if (y <= yMin) break;
      motsFenetre.push(...lignesParY[y]);
    }

    // Designation : x=100-320, en excluant le texte parasite "Veuillez..."
    const fragmentsDesign = motsFenetre
      .filter(m => m.x >= 100 && m.x < 320 && !m.texte.includes('Veuillez'))
      .sort((a, b) => a.x - b.x);
    const designation = fragmentsDesign.map(m => m.texte).join(' ').replace(/\s+/g, ' ').trim();

    const trouve = (xCible, tolerance = 6) => motsFenetre.find(m => Math.abs(m.x - xCible) <= tolerance)?.texte;
    const nbColisTexte = trouve(322);
    const qteTexte = trouve(348);

    const nbColis = nbColisTexte ? parseInt(nbColisTexte, 10) : null;
    const qte = qteTexte ? parseFloat(qteTexte.replace(',', '.')) : null;
    const pcb = (nbColis && qte) ? Math.round(qte / nbColis) : null;

    if (!designation) continue;

    lignes.push({
      codeInterne: p.reference,
      gencod: null,
      designationBrute: designation,
      quantite: nbColis,
      unite: 'colis',
      pcb,
      certitude: 'haute', // extraction par coordonnees, fiable
      ligneBrute: `${p.reference} | ${designation} | colis:${nbColis} | qte:${qte} | pcb:${pcb}`,
    });
  }

  return {
    client: 'scapalyon',
    numeroCommande,
    dateCommande: null,
    dateLivraison: parseDateFr(mDateLiv?.[1]),
    lignes,
  };
}

module.exports = { parserScapalyon };

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

    const mPcb = designation.match(/PCB\s*(\d+)/i);
    const pcb = mPcb ? parseInt(mPcb[1], 10) : null;
    const designationNettoyee = designation
      .replace(/\s*PCB\s*\d+\s*/i, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      codeInterne: code,
      gencod: null,
      designationBrute: designationNettoyee,
      quantite: quantites[idx] ?? null,
      unite: null,
      pcb,
      certitude: 'a_verifier', // extraction colonne recente, prudence par defaut
      ligneBrute: `${code} | ${designationNettoyee} | qte:${quantites[idx]}`,
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
// ── BIOCOOP ──────────────────────────────────────────────────────────────────
// Format bon de commande PDF Biocoop. Le "PCB" pour ce fournisseur correspond
// a la colonne "Cde Colis" du document.
//
// Texte pdf-parse : chaque ligne produit est collee sans separateur, mais la
// colonne "Cde Colis" a TOUJOURS 3 decimales (ex: "2,000"), ce qui la
// distingue nettement des 3 autres montants adjacents (Prix Unit., Tva,
// Total H.T.) qui n'ont que 2 decimales — ancre fiable pour le decoupage.
//
// Pattern reel observe :
//   GROS ROMANS LOCAL11,042,0005,5022,08FGRPC
//   1,000
// -> designation="GROS ROMANS LOCAL", prix_unit=11,04, cde_colis(PCB)=2,000,
//    tva=5,50, total_ht=22,08 (verification : 11,04 x 2 = 22,08 ✓)
//
// La reference produit qui suit (ex: "FGRPC", parfois un code numerique,
// parfois la designation dupliquee) n'est pas fiable a extraire — laissee
// vide, resolue plus tard par rapprochement de libelle si besoin.
async function parserBiocoop(texte) {
  const { resoudreClientParLibelle } = require('./parseur-generique');

  // N° commande : nombre isole juste apres notre propre adresse (fixe, connue)
  const mCmd = texte.match(/PLANTAY\s*\n(\d+)/i);
  const numeroCommande = mCmd ? mCmd[1] : 'INCONNU';

  const mDateLiv = texte.match(/Livraison\s+prévu\s+le\s+(\d{2}\/\d{2}\/\d{4})/i);
  const mDateCrea = texte.match(/Date\s+création\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);

  // Client dynamique : plusieurs magasins Biocoop possibles (comme Chez Andre)
  const mClient = texte.match(/(BIOCOOP[^\n]*)/i);
  const texteClientBrut = mClient?.[1]?.trim();
  const client = texteClientBrut ? await resoudreClientParLibelle(texteClientBrut) : null;

  // Lignes produit : designation + prix_unit(2 dec) + cde_colis(3 dec, PCB) +
  // tva(2 dec) + total_ht(2 dec)
  const regLigne = /([A-ZÀ-Ÿ][A-ZÀ-Ÿ0-9\s*\.\-]+?)(\d+,\d{2})(\d+,\d{3})(\d+,\d{2})(\d+,\d{2})/g;

  const lignes = [];
  let m;
  while ((m = regLigne.exec(texte)) !== null) {
    const designation = m[1].trim();
    const pcb = parseQte(m[3]);

    if (!designation) continue;

    lignes.push({
      codeInterne: null, // reference peu fiable dans ce format, non extraite
      gencod: null,
      designationBrute: designation,
      // quantite=1 (neutre) car Cde Colis va dans pcb : evite de compter en
      // double dans la formule "Qte totale = Qte x PCB" utilisee ailleurs.
      quantite: 1,
      unite: 'colis',
      pcb,
      certitude: 'a_verifier',
      ligneBrute: m[0],
    });
  }

  return {
    client,
    numeroCommande,
    dateCommande: mDateCrea ? convertirDate(mDateCrea[1]) : null,
    dateLivraison: mDateLiv ? convertirDate(mDateLiv[1]) : null,
    lignes,
  };
}

function parseQte(s) {
  const n = parseFloat(String(s).replace(',', '.'));
  return isNaN(n) ? null : n;
}

function convertirDate(dateStr) {
  const m = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const [, j, mo, a] = m;
  return `${a}-${mo}-${j}`;
}
// ── AC2T (plateforme intermediaire multi-magasins) ─────────────────────────
// Plateforme utilisee par plusieurs enseignes (Leclerc, U Express, Auchan...)
// pour transmettre leurs commandes — meme principe que "Chez Andre" pour le
// reseau Boucherie Andre : UN SEUL template PDF partage, le client reel
// (magasin) est indique DANS le document ("Client:"), pas fixe par config.
//
// Pour ce fournisseur, le PCB correspond a la colonne "Colisage" (nombre
// d'unites par colis), a distinguer du GENCODE qui la suit immediatement
// SANS separateur fiable. Astuce de decoupage : tous les gencods de notre
// catalogue font TOUJOURS exactement 13 chiffres (norme EAN13) — on prend
// donc les 13 derniers chiffres du bloc numerique comme gencode, le reste
// (1 ou 2 chiffres selon les lignes) comme colisage (PCB).
//
// Pattern reel observe (texte pdf-parse) :
//   BOUCHONS Affinés Epice kg1COLIS43 770 000 994 063
//   RIGOTTE Sèche x3 100g affinée filmée2COLIS163 770 000 994 049
// -> designation="BOUCHONS Affinés Epice kg", quantite_commande=1,
//    bloc numerique apres "COLIS"="43770000994063" (14 chiffres) ->
//    13 derniers="3770000994063" (gencode), reste="4" (PCB)
//    Meme logique pour "163770000994049" (15 chiffres) -> gencode 13
//    derniers, reste="16" (PCB, ici 2 chiffres).
async function parserAC2T(texte) {
  const { resoudreClientParLibelle } = require('./parseur-generique');

  const mCmd = texte.match(/Numéro\s+de\s+commande\s*:\s*(\d+)/i);
  const numeroCommande = mCmd ? mCmd[1] : 'INCONNU';

  const mDateCmd = texte.match(/Date\s+de\s+commande\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
  const mDateLiv = texte.match(/Date\s+de\s+livraison\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);

  // Client dynamique : magasin indique apres "Client:" (le texte est parfois
  // duplique/colle avec "TARIF: GENERAL" juste apres — on s'arrete la)
  const mClient = texte.match(/Client\s*:\s*\n([^\n]+?)TARIF/i);
  const texteClientBrut = mClient?.[1]?.trim();
  const client = texteClientBrut ? await resoudreClientParLibelle(texteClientBrut) : null;

  // Zone tableau : entre l'entete de colonnes ("GENCODE") et le pied de page
  // ("TOTAL COLIS")
  const idxDebut = texte.search(/GENCODE/i);
  const zoneApresEntete = idxDebut >= 0 ? texte.slice(idxDebut + 'GENCODE'.length) : texte;
  const idxFin = zoneApresEntete.search(/TOTAL COLIS/i);
  const zoneUtile = idxFin >= 0 ? zoneApresEntete.slice(0, idxFin) : zoneApresEntete;

  // Ancre fiable et unique : "COLIS" precede de 1-2 chiffres (quantite commandee).
  // La designation = tout le texte entre deux pivots consecutifs (par position,
  // pas par classe de caracteres — les designations contiennent souvent des
  // chiffres comme "150g"/"x3", ce qui casserait une regex de type [^\d]).
  const regPivot = /(\d{1,2})COLIS([\d\s]+?)(?=[A-ZÀ-Ÿ]|$)/g;

  const lignes = [];
  let m;
  let finPrecedent = 0;
  while ((m = regPivot.exec(zoneUtile)) !== null) {
    const designation = zoneUtile.slice(finPrecedent, m.index)
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const quantiteCommande = parseInt(m[1], 10);
    const blocDigits = m[2].replace(/\s+/g, '');
    const gencode = blocDigits.length >= 13 ? blocDigits.slice(-13) : null;
    const colisage = blocDigits.length >= 13 ? parseInt(blocDigits.slice(0, -13), 10) || null : null;

    finPrecedent = m.index + m[0].length;

    if (!designation) continue;

    lignes.push({
      codeInterne: null,
      gencod: gencode,
      designationBrute: designation,
      quantite: quantiteCommande,
      unite: 'colis',
      pcb: colisage,
      certitude: 'a_verifier',
      ligneBrute: `${designation} | qte:${quantiteCommande} | pcb:${colisage} | gencode:${gencode}`,
    });
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
// ── PERRIER (plateforme AC2T, format "Bon de commande Nr.") ────────────────
// Troisieme format lie a l'agence AC2T (distinct du template "Agence AC2T"
// deja gere par parserAC2T) — genere par le logiciel "PERRIER", utilise
// notamment par le reseau Super U. Le PCB correspond a la colonne "Cdt."
// (Conditionnement).
//
// PARTICULARITE TECHNIQUE : contrairement a tous les autres fournisseurs,
// le texte extrait par pdf-parse (lineaire) est ICI AMBIGU de facon
// insoluble par regex — le nombre de chiffres du PCB (1 ou 2) ne peut pas
// etre determine de facon fiable a partir du texte concatene seul (deux
// interpretations differentes peuvent toutes deux "coller" aux totaux
// verifies par calcul). On utilise donc pdfjs-dist pour recuperer la
// POSITION X REELLE de chaque bloc de texte sur la page, ce qui permet de
// separer les colonnes sans aucune ambiguite (Cdt a x≈258-262, Qte UC a
// x≈328-331, etc. — positions fixes du gabarit PERRIER).
//
// Les champs d'en-tete (numero, dates, client) restent extraits via
// pdf-parse classique (texte lineaire), qui les donne deja proprement.
const pdfParse = require('pdf-parse');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

async function parserPerrier(buffer) {
  const { resoudreClientParLibelle } = require('./parseur-generique');

  // ── En-tete : via pdf-parse (texte lineaire, deja propre pour ces champs) ──
  const dataTexte = await pdfParse(buffer);
  const texte = dataTexte.text;

  const mNum = texte.match(/Bon de commande Nr\.\s*(\d+)/i);
  const numeroCommande = mNum ? mNum[1] : 'INCONNU';

  const mDateLiv = texte.match(/Date livraison(\d{2}\/\d{2}\/\d{4})/i);
  const mDateCmd = texte.match(/Le\s+(\d{2}\/\d{2}\/\d{4})\s+à/i);

  const mClient = texte.match(/\n((?:Super U|Intermarché|Carrefour|Leclerc|U Express)[^\n]+)\n/i);
  const texteClientBrut = mClient?.[1]?.trim();
  const client = texteClientBrut ? await resoudreClientParLibelle(texteClientBrut) : null;

  // ── Lignes produit : via pdfjs-dist (positions X reelles, sans ambiguite) ──
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();

  const items = content.items
    .map(it => ({ x: Math.round(it.transform[4]), y: Math.round(it.transform[5]), texte: it.str }))
    .filter(it => it.texte.trim());

  const lignesParY = {};
  for (const it of items) {
    const yKey = Math.round(it.y / 2) * 2;
    lignesParY[yKey] = lignesParY[yKey] || [];
    lignesParY[yKey].push(it);
  }
  const ys = Object.keys(lignesParY).map(Number).sort((a, b) => b - a);

  // Lignes "pivot" = celles contenant un gencode (13 chiffres) en debut de colonne
  const pivots = [];
  for (const y of ys) {
    const mots = lignesParY[y];
    const gencodeItem = mots.find(m => /^\d{13}$/.test(m.texte) && m.x < 40);
    if (gencodeItem) pivots.push({ y, gencode: gencodeItem.texte, mots: mots.sort((a, b) => a.x - b.x) });
  }

  const lignes = [];
  for (let i = 0; i < pivots.length; i++) {
    const p = pivots[i];
    // Frontieres = milieu entre pivots voisins (gere les designations qui
    // s'enroulent au-dessus ET en dessous de leur propre ligne de gencode)
    const yMax = pivots[i - 1] ? (p.y + pivots[i - 1].y) / 2 : p.y + 15;
    const yMin = pivots[i + 1] ? (p.y + pivots[i + 1].y) / 2 : p.y - 15;

    const fragments = [];
    for (const y of ys) {
      if (y >= yMax) continue;
      if (y <= yMin) break;
      const mots = lignesParY[y].filter(m => m.x >= 100 && m.x < 250);
      for (const m of mots.sort((a, b) => a.x - b.x)) fragments.push(m.texte);
    }
    const designation = fragments.join(' ').replace(/\s+/g, ' ').trim();

    const trouve = (xCible, tolerance = 8) => p.mots.find(m => Math.abs(m.x - xCible) <= tolerance)?.texte;
    const pcbTexte = trouve(258) || trouve(262);
    const qteUCTexte = trouve(328) || trouve(331);

    if (!designation) continue;

    lignes.push({
      codeInterne: null,
      gencod: p.gencode,
      designationBrute: designation,
      quantite: qteUCTexte ? parseInt(qteUCTexte, 10) : null,
      unite: null,
      pcb: pcbTexte ? parseInt(pcbTexte, 10) : null,
      certitude: 'haute', // extraction par coordonnees, fiable
      ligneBrute: `${p.gencode} | ${designation} | pcb:${pcbTexte} | qte:${qteUCTexte}`,
    });
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

module.exports = { parserPerrier };

// ── PROVIDIS (plateforme AC2T, format "PROVIDIS LOGISTIQUE SAS") ──────────
// Quatrieme format lie a l'agence AC2T (email adv@ac2t.net partage avec
// AC2T/Leclerc et Perrier/Super U, mais structure de document totalement
// differente). Genere par le logiciel de la societe PROVIDIS LOGISTIQUE.
//
// Format de ligne produit tres simple, 4 lignes de texte par produit :
//   X4                              <- Condit. (PCB), prefixe par "X"
//   BOUCHON APERITIF EPICE 100G     <- designation
//   3                                <- Qte commandee
//   40642                            <- code reference produit
//
// Le "client" n'est pas nomme explicitement (pas d'enseigne du type "Super U")
// mais la ville de livraison apparait juste apres notre propre adresse
// (LE PLANTAY) — utilisee pour le rapprochement dynamique avec la table
// clients (meme mecanisme que Chez Andre / AC2T / Biocoop).
async function parserProvidis(texte) {
  const { resoudreClientParLibelle } = require('./parseur-generique');

  const mCmd = texte.match(/CF\/?(\d+)/);
  const numeroCommande = mCmd ? mCmd[1] : 'INCONNU';

  const mDateCmd = texte.match(/Date\s*\n(\d{2}\/\d{2}\/\d{4})/);
  const mDateLiv = texte.match(/(\d{2}\/\d{2}\/\d{4})\s*\nA livrer le/i);

  // Ville client : juste apres notre propre adresse (LE PLANTAY)
  const mClient = texte.match(/LE PLANTAY\s*\nTEL\s*\n\d{5}\s*\n([^\n]+)/i);
  const texteClientBrut = mClient?.[1]?.trim();
  const client = texteClientBrut ? await resoudreClientParLibelle(texteClientBrut) : null;

  // Lignes produit : X<PCB> / designation / quantite / code reference
  const regLigne = /^X(\d+)\n(.+)\n(\d+)\n(\d+)$/gm;

  const lignes = [];
  let m;
  while ((m = regLigne.exec(texte)) !== null) {
    const pcb = parseInt(m[1], 10);
    const designation = m[2].trim();
    const quantite = parseInt(m[3], 10);
    const codeReference = m[4];

    if (!designation) continue;

    lignes.push({
      codeInterne: codeReference,
      gencod: null,
      designationBrute: designation,
      quantite,
      unite: null,
      pcb,
      certitude: 'haute',
      ligneBrute: `X${pcb} | ${designation} | qte:${quantite} | code:${codeReference}`,
    });
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

module.exports = { parserProvidis };

// ── LE RELAIS LOCAL ─────────────────────────────────────────────────────────
// Format bon de commande PDF "Le Relais Local" (fournisseur ABBDO). Tableau
// dense (Reference/Designation/Nature/Marque/Nb Colis/Qte/PU Brut/R%/PU Net/
// Montant HT) dont le texte lineaire (pdf-parse) est fortement reordonne et
// ambigu (colonnes numeriques imbriquees sans separateur fiable).
//
// Comme pour Perrier, extraction par POSITION X REELLE (pdfjs-dist) plutot
// que par regex sur texte lineaire. Particularite ici : ni le PDF ni le texte
// n'affichent de colonne "PCB" directement — on la CALCULE a partir de deux
// colonnes distinctes et fiables : Qte (total unites) / Nb Colis (quantite
// commandee en colis) = PCB (verifie exact sur les 11 lignes du cas reel).
//
// Positions X reperees empiriquement (stables, gabarit fixe) :
//   Reference (6 chiffres)  : x < 40
//   Designation              : x 70-250
//   Nb Colis                 : x ≈ 356
//   Qte                      : x ≈ 387-389
async function parserRelaisLocal(buffer) {
  const pdfParse = require('pdf-parse');
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  const { resoudreClientParLibelle } = require('./parseur-generique');

  // ── En-tete : via pdf-parse (texte lineaire, propre pour ces champs) ──────
  const dataTexte = await pdfParse(buffer);
  const texte = dataTexte.text;

  const mCmd = texte.match(/Commande N°\s*(\S+)/i);
  const numeroCommande = mCmd ? mCmd[1] : 'INCONNU';

  const mDateCmd = texte.match(/(\d{2}\/\d{2}\/\d{4})\s*\nABBDO/);
  const mDateLiv = texte.match(/(\d{2}\/\d{2}\/\d{4})\s*\nDate Livraison Prévue/i);

  const mClient = texte.match(/\n((?:LE RELAIS LOCAL|[A-ZÀ-Ÿ][A-ZÀ-Ÿ\s]+))\nV\/Référence/i);
  const texteClientBrut = mClient?.[1]?.trim();
  const client = texteClientBrut ? await resoudreClientParLibelle(texteClientBrut) : null;

  // ── Lignes produit : via pdfjs-dist (positions X reelles) ─────────────────
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();

  const items = content.items
    .map(it => ({ x: Math.round(it.transform[4]), y: Math.round(it.transform[5]), texte: it.str }))
    .filter(it => it.texte.trim());

  const lignesParY = {};
  for (const it of items) {
    const yKey = Math.round(it.y / 2) * 2;
    lignesParY[yKey] = lignesParY[yKey] || [];
    lignesParY[yKey].push(it);
  }
  const ys = Object.keys(lignesParY).map(Number).sort((a, b) => b - a);

  const pivots = [];
  for (const y of ys) {
    const mots = lignesParY[y];
    const refItem = mots.find(m => /^\d{6}$/.test(m.texte) && m.x < 40);
    if (refItem) pivots.push({ y, reference: refItem.texte });
  }

  const lignes = [];
  for (let i = 0; i < pivots.length; i++) {
    const p = pivots[i];
    const yMax = pivots[i - 1] ? (p.y + pivots[i - 1].y) / 2 : p.y + 15;
    const yMin = pivots[i + 1] ? (p.y + pivots[i + 1].y) / 2 : p.y - 15;

    const motsFenetre = [];
    for (const y of ys) {
      if (y >= yMax) continue;
      if (y <= yMin) break;
      motsFenetre.push(...lignesParY[y]);
    }

    const fragmentsDesign = motsFenetre.filter(m => m.x >= 70 && m.x < 250).sort((a, b) => a.x - b.x);
    const designation = fragmentsDesign.map(m => m.texte).join(' ').replace(/\s+/g, ' ').trim();

    const trouve = (xCible, tolerance = 6) => motsFenetre.find(m => Math.abs(m.x - xCible) <= tolerance)?.texte;
    const nbColisTexte = trouve(356);
    const qteTexte = trouve(387) || trouve(389);

    const nbColis = nbColisTexte ? parseInt(nbColisTexte, 10) : null;
    const qte = qteTexte ? parseInt(qteTexte, 10) : null;
    const pcb = (nbColis && qte) ? Math.round(qte / nbColis) : null;

    if (!designation) continue;

    lignes.push({
      codeInterne: p.reference,
      gencod: null,
      designationBrute: designation,
      quantite: nbColis,
      unite: 'colis',
      pcb,
      certitude: 'haute', // extraction par coordonnees, fiable
      ligneBrute: `${p.reference} | ${designation} | colis:${nbColis} | qte:${qte} | pcb:${pcb}`,
    });
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

module.exports = { parserRelaisLocal };

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

    // ligneNum1 (zone[j]) = PCB + Stock colles (ex: "60" -> PCB=6, Stock=0)
    // Heuristique : le dernier chiffre = Stock, le reste = PCB — valable tant
    // que Stock reste < 10 (cas observes jusqu'ici, comme pour Colis ci-dessous).
    const ligneNum1 = zone[j];
    const pcb = ligneNum1 && ligneNum1.length > 1 ? parseInt(ligneNum1.slice(0, -1), 10) : null;

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
        pcb,
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
  if (t.includes('piècecolis') || t.includes('site de livraison')) return 'chez_andre';
  if (t.includes('biocoop') || f.includes('biocoop')) return 'biocoop';
  if (t.includes('perrier')) return 'perrier';
  if (t.includes('providis')) return 'providis';
  if (t.includes('lerelaislocal') || t.includes('le relais local')) return 'relais_local';
  if (t.includes('ac2t')) return 'ac2t';
  return null;
}

async function parserPdf(texte, nomFichier = '', buffer = null) {
  const fournisseur = detecterFournisseur(texte, nomFichier);
  if (fournisseur === 'distral')    return parserDistral(texte);
  if (fournisseur === 'scapalyon') return await parserScapalyon(buffer);
  if (fournisseur === 'logifresh')  return parserLogifresh(texte);
  if (fournisseur === 'chez_andre') return await parserChezAndre(texte);
  if (fournisseur === 'biocoop')    return await parserBiocoop(texte);
  if (fournisseur === 'ac2t')       return await parserAC2T(texte);
  if (fournisseur === 'perrier') return await parserPerrier(buffer);
  if (fournisseur === 'providis') return await parserProvidis(texte);
  if (fournisseur === 'relais_local') return await parserRelaisLocal(buffer);

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

module.exports = { parserPdf, parserDistral, parserScapalyon, parserLogifresh, parserChezAndre, detecterFournisseur, parseDateFr, parserBiocoop, parserAC2T,parserPerrier,parserProvidis,parserRelaisLocal};