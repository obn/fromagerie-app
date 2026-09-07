/**
 * Extraction de commande via l'API Claude (Anthropic), en DERNIER RECOURS
 * quand aucun parseur configure (regex generique DB ou JS dedie) ne
 * reconnait le fournisseur. Claude lit le PDF VISUELLEMENT (texte + mise
 * en page), ce qui evite tous les problemes de fragmentation/reordonnancement
 * de colonnes rencontres avec pdf-parse sur certains formats (vecu avec
 * Disprodal et Chez Andre).
 *
 * Necessite ANTHROPIC_API_KEY dans .env (cle recuperable sur
 * console.anthropic.com — voir https://docs.claude.com/en/docs/get-started
 * pour la creation d'une cle et le suivi des couts).
 */

const Anthropic = require('@anthropic-ai/sdk');

const MODELE = 'claude-sonnet-5';

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY manquant dans .env — obligatoire pour l\'extraction IA de secours');
  }
  return new Anthropic({ apiKey });
}

const PROMPT_EXTRACTION = `Tu es un assistant d'extraction de donnees pour une fromagerie qui recoit des bons de commande de ses clients (magasins, grossistes) par email, sous forme de PDF.

Analyse ce PDF et extrais les informations suivantes au format JSON STRICT (rien d'autre que le JSON, pas de texte avant/apres, pas de balises markdown) :

{
  "client": "nom du client/magasin/enseigne tel qu'il apparait sur le document (celui qui PASSE la commande, pas le fournisseur/fromagerie qui la RECOIT)",
  "numeroCommande": "numero du bon de commande",
  "dateCommande": "YYYY-MM-DD ou null si absente",
  "dateLivraison": "YYYY-MM-DD (date de livraison si indiquee, sinon null)",
  "lignes": [
    {
      "codeInterne": "reference produit telle qu'affichee sur le document (peut etre null si absente)",
      "designationBrute": "designation/libelle du produit tel qu'ecrit sur le document",
      "quantite": nombre (quantite commandee, en unites/colis/caissage selon ce qui est indique comme LA quantite a preparer — pas le conditionnement/PCB ni le stock disponible),
      "unite": "unite si precisee (kg, piece, colis...) sinon null"
    }
  ]
}

Regles importantes :
- Le "client" est celui qui a EMIS la commande (magasin, enseigne, grossiste) — pas notre fromagerie qui la recoit.
- Pour "quantite", identifie la colonne qui represente la quantite REELLEMENT commandee, pas le conditionnement ni le stock disponible.
- Si une information est absente ou illisible, mets null plutot que d'inventer une valeur.
- Reponds UNIQUEMENT avec le JSON, sans aucun texte d'accompagnement.`;

async function parserPdfAvecIA(buffer, filename) {
  const client = getClient();
  const base64Pdf = buffer.toString('base64');

  console.log(`[parser IA] Extraction via Claude pour "${filename}" (fournisseur non reconnu par les parsers configures)`);

  const response = await client.messages.create({
    model: MODELE,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf } },
          { type: 'text', text: PROMPT_EXTRACTION },
        ],
      },
    ],
  });

  const texteReponse = response.content.find(b => b.type === 'text')?.text || '';

  let donnees;
  try {
    const nettoye = texteReponse.replace(/^```json\s*|```\s*$/g, '').trim();
    donnees = JSON.parse(nettoye);
  } catch (e) {
    throw new Error(`Reponse IA non exploitable (JSON invalide) : ${e.message}`);
  }

  // Rapprochement du client extrait avec la table clients (meme logique que
  // pour les fournisseurs a client dynamique comme Chez Andre)
  const { resoudreClientParLibelle } = require('./parseur-generique');
  const clientResolu = donnees.client ? await resoudreClientParLibelle(donnees.client) : null;

  return {
    client: clientResolu,
    numeroCommande: donnees.numeroCommande || 'INCONNU',
    dateCommande: donnees.dateCommande || null,
    dateLivraison: donnees.dateLivraison || null,
    lignes: (donnees.lignes || []).map(l => ({
      codeInterne: l.codeInterne || null,
      gencod: null,
      designationBrute: l.designationBrute || null,
      quantite: l.quantite ?? null,
      unite: l.unite || null,
      certitude: 'a_verifier', // extraction IA encore recente -> prudence par defaut, a confirmer manuellement
      ligneBrute: JSON.stringify(l),
    })),
  };
}

module.exports = { parserPdfAvecIA };
