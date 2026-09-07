// ── CHEZ ANDRÉ ───────────────────────────────────────────────────────────────
// Template partage entre tous les magasins du reseau Boucherie Andre — le
// client reel (magasin destinataire) est indique DANS le PDF ("Site de
// livraison"), pas fixe. Format texte pdf-parse tres fragmente : chaque
// bloc produit s'etale sur un nombre VARIABLE de lignes (designation
// enjambant 1 a 3 lignes selon sa longueur), impossible a capturer par une
// simple regex — necessite un scan par blocs comme ci-dessous.
//
// Pattern d'un bloc produit dans le texte extrait :
//   29379FBE055                    <- PLU + PLU Frn colles (PLU Frn optionnel)
//   BOUCHON - AUX EPICES - VACHE   <- designation (1 a 3 lignes)
//   - BIO - 100G
//   100                             <- PCB(10) + Stock(0) colles
//   01                              <- Piece(0) + Colis(1) colles
//
// Le nombre de COLIS (dernier chiffre de la ligne numerique finale) est la
// quantite pertinente pour la production (verifie : la somme des colis de
// toutes les lignes correspond exactement au total "TOTAL COLIS" affiche
// en en-tete du document).
//
// LIMITE CONNUE : l'extraction de Stock/Colis suppose qu'ils tiennent sur
// un seul chiffre (0-9), en isolant le DERNIER caractere de chaque ligne
// numerique collee. Valable pour tous les cas observes a ce jour ; a
// revoir si un jour une commande depasse 9 colis sur une seule ligne.
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
