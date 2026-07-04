<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>Carnet du jour</h1>
        <p class="subtitle">{{ dateAffichee }}</p>
      </div>
      <div class="toolbar">
        <input type="date" v-model="dateSelectionnee" @change="charger" class="sel" />
        <span class="count-badge">{{ nbFait }} / {{ nbTotal }} fait</span>
      </div>
    </div>

    <p class="statut-line" :class="statutClass" v-if="statutMsg">{{ statutMsg }}</p>

    <div class="legend" v-if="nbTotal > 0">
      <span><span class="swatch unsure"></span> à vérifier (lecture PDF incertaine)</span>
      <span>{{ nbTotal }} ligne(s) de commande</span>
    </div>

    <!-- CHARGEMENT / VIDE -->
    <div v-if="chargement" class="etat">Chargement…</div>
    <div v-else-if="!commandes.length" class="etat vide">
      Aucune commande pour le {{ dateAffichee }}.<br>
      <span class="hint">Utilisez le pipeline PDF ou ajoutez une commande manuellement.</span>
    </div>

    <!-- CONTENU -->
    <div v-else class="wrap">
      <!-- Conteneur a defilement horizontal : aucun retour a la ligne, on glisse au doigt si l'ecran est etroit -->
      <div class="scroll-x">
        <div class="scroll-x-inner">

        <!-- En-tete colonnes -->
        <div class="head-row">
          <span></span>
          <span class="col-label">Produit</span>
          <span class="col-label">DLC / N° lot</span>
        </div>

        <!-- BLOC PAR CLIENT -->
        <div v-for="commande in commandes" :key="commande.id" class="client-block">
        <div class="client-name">
          <span>{{ commande.client_nom }}</span>
          <span class="commande-infos">
            N° {{ commande.numero_commande }}
            <template v-if="commande.date_commande"> · Cdé le {{ fmtDate(commande.date_commande) }}</template>
            · Livr. le {{ fmtDate(commande.date_livraison) }}
          </span>
        </div>

        <!-- LIGNES : conteneur "table" pour un alignement de colonnes stable, -->
        <!-- indépendant de la longueur du texte de chaque ligne individuelle -->
        <div class="rows-table">
        <div
          v-for="ligne in commande.lignes"
          :key="ligne.id"
          :class="['row', { done: etats[ligne.id]?.fait, unsure: ligne.certitude !== 'haute' }]"
        >
          <!-- Coche : enveloppee dans un div, Safari applique mal display:table-cell direct sur un input -->
          <div class="check-cell">
            <input
              type="checkbox"
              class="check"
              :checked="etats[ligne.id]?.fait"
              @change="cocher(ligne, $event.target.checked)"
            />
          </div>

          <!-- Produit -->
          <div class="prodline">
            <span class="qty">{{ ligne.quantite }}<template v-if="ligne.unite"> {{ ligne.unite }}</template></span>

            <span v-if="ligne.certitude === 'non_fiable'" class="unsure-label">
              ⚠ ligne brute (chevauchement PDF, à relire) : "{{ ligne.ligne_brute }}"
            </span>

            <template v-else>
              <!-- Designation : surlignee en jaune si incertaine ; clic pour editer -->
              <span
                v-if="editId !== ligne.id"
                :class="['design-text', { unsure: ligne.certitude !== 'haute' }]"
                @click="editId = ligne.id"
              >{{ etats[ligne.id]?.produit ?? ligne.designation_brute }}</span>
              <input
                v-else
                class="product-input"
                :class="{ unsure: ligne.certitude !== 'haute' }"
                :value="etats[ligne.id]?.produit ?? ligne.designation_brute"
                @input="majEtat(ligne.id, 'produit', $event.target.value)"
                @blur="editId = null"
              />

              <!-- Reference : tag bracket vert style maquette, clic pour editer -->
              <span
                v-if="(ligne.code_interne || ligne.gencod) && editRefId !== ligne.id"
                class="ref-tag"
                @click="editRefId = ligne.id"
              >[{{ etats[ligne.id]?.ref ?? (ligne.code_interne || ligne.gencod) }}]</span>
              <input
                v-else-if="ligne.code_interne || ligne.gencod"
                class="ref-input"
                :value="etats[ligne.id]?.ref ?? (ligne.code_interne || ligne.gencod)"
                @input="majEtat(ligne.id, 'ref', $event.target.value)"
                @blur="editRefId = null"
              />

              <span v-if="ligne.tarif_net" class="prix-hint">
                {{ Number(ligne.tarif_net).toFixed(2) }} € / {{ ligne.unite_tarif }}
              </span>
            </template>
          </div>

          <!-- DLC + Lot regroupes : passent sous le produit sur petit ecran (evite le chevauchement) -->
          <div class="fields">
            <input
              type="date"
              class="field field-dlc"
              :value="etats[ligne.id]?.dlc"
              @input="majEtat(ligne.id, 'dlc', $event.target.value)"
            />
            <input
              type="text"
              class="field field-lot"
              placeholder="Lot"
              :value="etats[ligne.id]?.lot"
              @input="majEtat(ligne.id, 'lot', $event.target.value)"
            />
          </div>
        </div>

        </div>
        </div>

        </div>
      </div>

      <!-- FOOTER -->
      <p class="footer-note">
        Les coches, DLC et numéros de lot sont sauvegardés automatiquement en base.
      </p>
      <div class="footer-note" style="text-align:right; margin-bottom:40px">
        <button class="reset-btn" @click="reinitialiser">Réinitialiser la journée</button>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue';
import { api } from '../services/api';

// ── Date ─────────────────────────────────────────────────────────────────────
const aujourd_hui = new Date().toISOString().slice(0, 10);
const dateSelectionnee = ref(aujourd_hui);

const dateAffichee = computed(() =>
  new Date(dateSelectionnee.value + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
);

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Données ───────────────────────────────────────────────────────────────────
const commandes = ref([]);
const chargement = ref(true);
const etats = reactive({});          // { [ligneId]: { fait, dlc, lot, produit, ref } }
const editId = ref(null);            // id de la ligne dont la designation est en edition
const editRefId = ref(null);         // id de la ligne dont la reference est en edition
const statutMsg = ref('Chargement de l\'historique…');
const statutClass = ref('');

const nbTotal = computed(() =>
  commandes.value.reduce((acc, c) => acc + (c.lignes?.length || 0), 0)
);
const nbFait = computed(() =>
  Object.values(etats).filter(e => e.fait).length
);

// ── Chargement ────────────────────────────────────────────────────────────────
async function charger() {
  chargement.value = true;
  statutMsg.value = 'Chargement…';
  statutClass.value = '';
  const [annee, mois, jour] = dateSelectionnee.value.split('-');
  try {
    const data = await api.get(`/carnet/${annee}/${mois}/${jour}`);
    commandes.value = data;

    // Pré-remplir les états depuis ce qui est déjà en base (fait, dlc, numero_lot)
    for (const commande of data) {
      for (const ligne of commande.lignes || []) {
        etats[ligne.id] = {
          fait:    !!ligne.fait,
          dlc:     ligne.dlc     ? ligne.dlc.slice(0, 10) : '',
          lot:     ligne.numero_lot || '',
          produit: ligne.designation_brute || '',
          ref:     ligne.code_interne || ligne.gencod || '',
        };
      }
    }
    statutMsg.value = data.length ? 'Historique chargé ✓' : '';
  } catch (e) {
    statutMsg.value = 'Impossible de charger le carnet : ' + e.message;
    statutClass.value = 'erreur';
  } finally {
    chargement.value = false;
  }
}

// ── Saisie ────────────────────────────────────────────────────────────────────
function majEtat(ligneId, champ, valeur) {
  if (!etats[ligneId]) etats[ligneId] = {};
  etats[ligneId][champ] = valeur;
  declencherSauvegarde(ligneId);
}

function cocher(ligne, checked) {
  if (!etats[ligne.id]) etats[ligne.id] = {};
  etats[ligne.id].fait = checked;
  declencherSauvegarde(ligne.id);
}

// ── Sauvegarde (debounce 400ms) ───────────────────────────────────────────────
const timers = {};

function declencherSauvegarde(ligneId) {
  statutMsg.value = 'Enregistrement…';
  statutClass.value = '';
  clearTimeout(timers[ligneId]);
  timers[ligneId] = setTimeout(() => sauvegarderLigne(ligneId), 400);
}

async function sauvegarderLigne(ligneId) {
  const e = etats[ligneId];
  if (!e) return;
  // Trouver la commande parente pour construire l'URL
  let commandeId = null;
  for (const c of commandes.value) {
    if ((c.lignes || []).some(l => l.id === ligneId)) { commandeId = c.id; break; }
  }
  if (!commandeId) return;

  try {
    await api.patch(`/commandes/${commandeId}/lignes/${ligneId}`, {
      fait:              e.fait ? 1 : 0,
      dlc:               e.dlc || null,
      numero_lot:        e.lot || null,
      designation_brute: e.produit || null,
      code_interne:      e.ref || null,
      fait_le:           e.fait ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null,
    });
    statutMsg.value = 'Enregistré ✓';
    statutClass.value = 'ok';
  } catch (err) {
    statutMsg.value = 'Échec d\'enregistrement — ' + err.message;
    statutClass.value = 'erreur';
  }
}

// ── Réinitialisation ──────────────────────────────────────────────────────────
async function reinitialiser() {
  if (!confirm('Effacer toutes les coches, DLC et numéros de lot pour cette journée ?')) return;
  for (const commande of commandes.value) {
    for (const ligne of commande.lignes || []) {
      etats[ligne.id] = { fait: false, dlc: '', lot: '', produit: ligne.designation_brute || '', ref: ligne.code_interne || ligne.gencod || '' };
      const cid = commande.id;
      await api.patch(`/commandes/${cid}/lignes/${ligne.id}`, { fait: 0, dlc: null, numero_lot: null, fait_le: null });
    }
  }
  statutMsg.value = 'Journée réinitialisée ✓';
}

onMounted(charger);
</script>

<style scoped>
/* Palette identique aux autres pages (Commandes, Referentiels, Parametres) */
.page { max-width: 1100px; margin: 0 auto; padding: 24px 16px 60px; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
h1 { margin: 0; font-size: 1.4rem; color: #1a2a4a; }
.subtitle { margin: 2px 0 0; color: #7a8898; font-size: 0.85rem; text-transform: capitalize; }

.toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.sel { padding: 7px 10px; border: 1px solid #d0cbb8; border-radius: 6px; font-size: 0.85rem; background: white; }
.count-badge { background: #eef6ec; color: #2f6f4f; font-weight: 700; font-size: 0.82rem; padding: 5px 12px; border-radius: 20px; white-space: nowrap; }

.statut-line { max-width: 1100px; margin: -8px 0 12px; font-size: 0.78rem; color: #2f6f4f; text-align: right; }
.statut-line.erreur { color: #b3261e; }

.legend { margin: 0 0 14px; font-size: 0.8rem; color: #7a8898; display: flex; gap: 16px; flex-wrap: wrap; }
.swatch { display: inline-block; width: 11px; height: 11px; border-radius: 2px; border: 1px solid #d8c400; margin-right: 4px; vertical-align: middle; background: #fff3a0; }

.etat { padding: 40px; text-align: center; color: #7a8898; }
.hint { font-size: 0.85rem; display: block; margin-top: 8px; }

/* Defilement horizontal : aucun retour a la ligne, on glisse au doigt si l'ecran
   est trop etroit pour tout afficher sur une seule ligne (utile en portrait iPad). */
.scroll-x { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.scroll-x-inner { min-width: 640px; }

/* En-tete colonnes : meme style que les th des tables des autres pages */
.head-row { display: grid; grid-template-columns: 44px minmax(280px, max-content) 260px; column-gap: 24px; padding: 0 14px 6px; }
.col-label { font-size: 0.71rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #5a6070; }

/* Bloc client : carte blanche + ombre, identique a .table-wrap ailleurs */
.client-block { background: white; border-radius: 10px; margin-bottom: 16px; box-shadow: 0 1px 6px rgba(0,0,0,0.10); }
.client-name {
  font-weight: 700; color: #1a2a4a; font-size: 1rem;
  padding: 10px 14px; background: #f5f2e8;
  border-bottom: 2px solid #e8e3d5; border-radius: 10px 10px 0 0;
  display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 6px;
}
.commande-infos { font-size: 0.75rem; font-weight: 500; color: #7a8898; }

/* Lignes : display:table plutot que grid par ligne. Avantage cle : la largeur
   des colonnes est calculee UNE FOIS pour tout le bloc client (sur la base du
   contenu le plus large), donc les colonnes DLC/Lot restent parfaitement
   alignees entre toutes les lignes, quelle que soit la longueur du libelle
   produit de chacune — contrairement a un grid independant par ligne. */
.rows-table { display: table; width: 100%; table-layout: auto; border-collapse: collapse; }
.row { display: table-row; }
.row > * { display: table-cell; vertical-align: middle; padding: 10px 14px; border-bottom: 1px solid #f0ece0; }
.row:last-child > * { border-bottom: none; }
.row:hover > * { background: #faf8f2; }
.row.done > * { background: #eef6ec; }
.row.done:hover > * { background: #e6f2e3; }
.row.done .prodline { text-decoration: line-through; color: #7a8a7a; opacity: 0.75; }
.row.unsure:not(.done) > *:first-child { border-left: 3px solid #d8c400; }
.row.unsure:not(.done) > * { background: #fffaf0; }
.row.unsure:not(.done):hover > * { background: #fff5e0; }
.rows-table .row:last-child > *:first-child { border-radius: 0 0 0 10px; }
.rows-table .row:last-child > *:last-child { border-radius: 0 0 10px 0; }

/* Coche */
.check-cell { width: 26px; text-align: center; }
.check { width: 26px; height: 26px; accent-color: #2f6f4f; cursor: pointer; }

/* Produit */
/* display:table-cell requis pour la colonne du tableau ; l'agencement horizontal
   interne (qty + designation + ref + prix) se fait via white-space:nowrap et
   des elements inline/inline-block avec marges, pas via flex (conflit avec
   table-cell sur le meme element). */
.prodline { display: table-cell; vertical-align: middle; white-space: nowrap; font-size: 0.9rem; color: #222; }
.qty { font-weight: 700; color: #1a2a4a; margin-right: 2px; white-space: nowrap; }

.design-text { cursor: text; padding: 1px 3px; border-radius: 3px; color: #1a1a1a; margin-right: 6px; }
.design-text.unsure { background: #fff3a0; padding: 1px 5px; border-radius: 3px; font-weight: 600; box-shadow: inset 0 0 0 1px #d8c400; }
.design-text:hover { outline: 1px dashed #d0cbb8; }

.product-input { font-size: 0.9rem; border: 1px solid #2f6f4f; border-radius: 6px; padding: 4px 8px; min-width: 140px; background: white; margin-right: 6px; vertical-align: middle; }
.product-input.unsure { background: #fff3a0; border-color: #d8c400; }
.product-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(47,111,79,0.2); }

/* Reference : meme style de tag que les codes mono ailleurs (vert) */
.ref-tag { font-size: 0.8rem; color: #2f6f4f; font-weight: 700; cursor: text; white-space: nowrap; background: #eef6ec; padding: 1px 6px; border-radius: 4px; margin-right: 6px; }
.ref-tag:hover { text-decoration: underline dotted; }
.ref-input { font-size: 0.8rem; border: 1px solid #2f6f4f; background: white; padding: 2px 6px; color: #2f6f4f; width: 90px; border-radius: 4px; margin-right: 6px; vertical-align: middle; }
.ref-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(47,111,79,0.2); }

.prix-hint { font-size: 0.75rem; color: #2f6f4f; font-weight: 600; white-space: nowrap; }
.unsure-label { background: #fff3a0; padding: 4px 8px; border-radius: 4px; font-size: 0.82rem; font-weight: 600; color: #7a6000; white-space: pre-wrap; box-shadow: inset 0 0 0 1px #d8c400; }

/* Champs DLC / Lot : meme style d'input que les autres pages (bordure claire, focus vert) */
/* display:table-cell est requis pour que cette colonne participe au tableau
   de la ligne (alignement stable) — l'agencement cote-a-cote des 2 champs
   se fait via les inputs en inline-block ci-dessous, pas via flex (qui
   entrerait en conflit avec table-cell sur le meme element). */
.fields { display: table-cell; vertical-align: middle; width: 260px; white-space: nowrap; }
.field {
  width: 100%; min-width: 0;
  border: 1px solid #d0cbb8;
  border-radius: 6px;
  padding: 7px 8px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #1a2a4a;
  background: white;
  text-align: center;
}
.field::placeholder { color: #a89b7a; font-weight: 500; }
.field:hover { border-color: #2f6f4f; }
.field:focus { outline: none; border-color: #2f6f4f; box-shadow: 0 0 0 2px rgba(47,111,79,0.2); }
.field-dlc { display: inline-block; width: 155px; margin-right: 8px; vertical-align: middle; }
.field-lot { display: inline-block; width: 90px; vertical-align: middle; }

/* Footer */
.footer-note { margin: 18px 0 0; font-size: 0.78rem; color: #7a8898; }
.reset-btn { background: #b3261e; color: white; border: none; padding: 8px 18px; border-radius: 6px; font-size: 0.85rem; font-weight: 600; cursor: pointer; }
.reset-btn:hover { background: #8e1a14; }

@media (max-width: 480px) {
  h1 { font-size: 1.2rem; }
  .toolbar { gap: 8px; }
}
</style>