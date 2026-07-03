<template>
  <div class="carnet">

    <!-- HEADER STICKY -->
    <header class="header">
      <div class="header-left">
        <router-link to="/" class="nav-back">← Accueil</router-link>
        <h1>{{ dateAffichee }} — Carnet de commandes</h1>
      </div>
      <div class="header-right">
        <input type="date" v-model="dateSelectionnee" @change="charger" class="date-picker" />
        <span class="progress">{{ nbFait }} / {{ nbTotal }} fait</span>
      </div>
    </header>

    <div class="statut-bar" :class="statutClass">{{ statutMsg }}</div>

    <div class="legend">
      <span><span class="swatch unsure"></span> à vérifier (lecture PDF incertaine)</span>
      <span v-if="nbTotal > 0">{{ nbTotal }} ligne(s) de commande</span>
    </div>

    <!-- CHARGEMENT / VIDE -->
    <div v-if="chargement" class="etat">Chargement…</div>
    <div v-else-if="!commandes.length" class="etat vide">
      Aucune commande pour le {{ dateAffichee }}.<br>
      <span class="hint">Utilisez le pipeline PDF ou ajoutez une commande manuellement.</span>
    </div>

    <!-- CONTENU -->
    <div v-else class="wrap">

      <!-- En-tête colonnes -->
      <div class="head-row">
        <span></span>
        <span class="col-label">Produit</span>
        <span class="col-label">DLC</span>
        <span class="col-label">N° lot</span>
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

        <!-- LIGNES -->
        <div
          v-for="ligne in commande.lignes"
          :key="ligne.id"
          :class="['row', { done: etats[ligne.id]?.fait, unsure: ligne.certitude !== 'haute' }]"
        >
          <!-- Coche -->
          <input
            type="checkbox"
            class="check"
            :checked="etats[ligne.id]?.fait"
            @change="cocher(ligne, $event.target.checked)"
          />

          <!-- Produit -->
          <div class="prodline">
            <span class="qty">{{ ligne.quantite }}<template v-if="ligne.unite"> {{ ligne.unite }}</template></span>
            <span v-if="ligne.certitude === 'non_fiable'" class="unsure-label">
              ⚠ ligne brute (chevauchement PDF, à relire) : "{{ ligne.ligne_brute }}"
            </span>
            <template v-else>
              <input
                class="product-input"
                :class="{ unsure: ligne.certitude !== 'haute' }"
                :value="etats[ligne.id]?.produit ?? ligne.designation_brute"
                @input="majEtat(ligne.id, 'produit', $event.target.value)"
              />
              <input
                v-if="ligne.code_interne || ligne.gencod"
                class="ref-input"
                :value="etats[ligne.id]?.ref ?? (ligne.code_interne || ligne.gencod)"
                @input="majEtat(ligne.id, 'ref', $event.target.value)"
              />
              <span v-if="ligne.tarif_net" class="prix-hint">
                {{ Number(ligne.tarif_net).toFixed(2) }} € / {{ ligne.unite_tarif }}
              </span>
            </template>
          </div>

          <!-- DLC -->
          <input
            type="date"
            class="field"
            :value="etats[ligne.id]?.dlc"
            @input="majEtat(ligne.id, 'dlc', $event.target.value)"
          />

          <!-- Lot -->
          <input
            type="text"
            class="field"
            placeholder="Lot"
            :value="etats[ligne.id]?.lot"
            @input="majEtat(ligne.id, 'lot', $event.target.value)"
          />
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
/* ── Variables ── */
:root {
  --paper:    #fbf9f3;
  --ink:      #1a2a4a;
  --unsure:   #fff3a0;
  --muted:    #8a8470;
  --line:     #ddd7c2;
  --done-bg:  #eef6ec;
  --accent:   #2f6f4f;
  --prix:     #4a7a5a;
}

.carnet { background: #e7e2d3; min-height: 100vh; padding-bottom: 80px; }

/* Header */
.header {
  position: sticky; top: 0; z-index: 10;
  background: var(--ink); color: white;
  padding: 12px 18px;
  display: flex; align-items: center; justify-content: space-between;
  flex-wrap: wrap; gap: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.header-left { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.header-right { display: flex; align-items: center; gap: 12px; }
.nav-back { color: white; text-decoration: none; font-weight: 600; font-size: 0.9rem; opacity: 0.85; }
.nav-back:hover { opacity: 1; }
h1 { margin: 0; font-size: 1rem; font-weight: 600; }
.progress { font-size: 0.85rem; opacity: 0.85; white-space: nowrap; }
.date-picker { border: 1px solid rgba(255,255,255,0.3); background: rgba(255,255,255,0.1); color: white; border-radius: 6px; padding: 4px 8px; font-size: 0.82rem; cursor: pointer; }
.date-picker::-webkit-calendar-picker-indicator { filter: invert(1); }

/* Statut */
.statut-bar { max-width: 900px; margin: 6px auto 0; padding: 2px 14px; font-size: 0.78rem; color: var(--accent); text-align: right; min-height: 20px; }
.statut-bar.erreur { color: #b3261e; }
.statut-bar.ok { color: var(--accent); }

/* Légende */
.legend { max-width: 900px; margin: 8px auto 4px; padding: 0 14px; font-size: 0.8rem; color: var(--muted); display: flex; gap: 16px; flex-wrap: wrap; }
.swatch { display: inline-block; width: 11px; height: 11px; border-radius: 2px; border: 1px solid #d8c400; margin-right: 4px; vertical-align: middle; }
.swatch.unsure { background: var(--unsure); }

/* États */
.etat { max-width: 900px; margin: 40px auto; padding: 0 14px; text-align: center; color: var(--muted); }
.hint { font-size: 0.85rem; display: block; margin-top: 8px; }

/* Wrap */
.wrap { max-width: 900px; margin: 0 auto; padding: 8px 14px 0; }

/* En-tête colonnes */
.head-row { display: grid; grid-template-columns: 44px 1fr 130px 130px; gap: 8px; padding: 4px 12px 0; }
.col-label { font-size: 0.65rem; text-transform: uppercase; color: var(--muted); text-align: center; letter-spacing: 0.03em; }

/* Bloc client */
.client-block { background: var(--paper); border-radius: 10px; margin-bottom: 16px; box-shadow: 0 1px 6px rgba(0,0,0,0.12); overflow: hidden; }
.client-name { font-weight: 700; color: var(--ink); font-size: 1rem; padding: 10px 12px; background: #f2eedf; border-bottom: 1px solid var(--line); display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 6px; }
.commande-infos { font-size: 0.75rem; font-weight: 500; color: var(--muted); }

/* Ligne */
.row { display: grid; grid-template-columns: 44px 1fr 130px 130px; gap: 8px; align-items: center; padding: 9px 12px; border-bottom: 1px solid var(--line); transition: background 0.15s; }
.row:last-child { border-bottom: none; }
.row.done { background: var(--done-bg); }
.row.done .prodline { opacity: 0.65; }
.row.done .product-input { text-decoration: line-through; color: #6b7a6b; }
.row.unsure:not(.done) { background: #fffaf0; }

/* Coche */
.check { width: 30px; height: 30px; accent-color: var(--accent); cursor: pointer; }

/* Produit */
.prodline { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; font-size: 0.92rem; }
.qty { font-weight: 700; color: var(--ink); margin-right: 4px; white-space: nowrap; }
.product-input { font-size: 0.92rem; border: 1px solid #cfc8af; border-radius: 6px; padding: 5px 8px; flex: 1; min-width: 140px; background: white; }
.product-input.unsure { background: var(--unsure); border-color: #d8c400; }
.product-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px rgba(47,111,79,0.2); }
.ref-input { font-size: 0.78rem; border: 1px solid transparent; background: transparent; padding: 2px 6px; color: var(--prix); width: 80px; border-radius: 4px; }
.ref-input:focus { border-color: #cfc8af; background: white; outline: none; }
.prix-hint { font-size: 0.75rem; color: var(--prix); font-weight: 600; white-space: nowrap; }
.unsure-label { background: var(--unsure); padding: 2px 6px; border-radius: 4px; font-size: 0.84rem; color: #7a6000; flex: 1; }

/* Champs DLC / Lot */
.field { width: 100%; border: 1px solid #cfc8af; border-radius: 6px; padding: 7px 6px; font-size: 0.82rem; background: white; text-align: center; }
.field:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px rgba(47,111,79,0.25); }

/* Footer */
.footer-note { max-width: 900px; margin: 18px auto 0; padding: 0 14px; font-size: 0.78rem; color: var(--muted); }
.reset-btn { background: #b3261e; color: white; border: none; padding: 8px 14px; border-radius: 6px; font-size: 0.8rem; cursor: pointer; }
.reset-btn:hover { background: #8e1a14; }

/* Responsive mobile */
@media (max-width: 600px) {
  .row { grid-template-columns: 36px 1fr 100px 90px; gap: 5px; padding: 8px 8px; }
  .head-row { grid-template-columns: 36px 1fr 100px 90px; gap: 5px; padding: 4px 8px 0; }
  .product-input { min-width: 100px; }
  h1 { font-size: 0.88rem; }
}
</style>