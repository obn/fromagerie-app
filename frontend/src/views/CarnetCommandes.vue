<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>Carnet du jour</h1>
        <p class="subtitle">{{ dateAffichee }}</p>
      </div>
      <div class="toolbar">
        <button class="btn-nav" type="button" @click="prevDay" aria-label="Jour précédent">◀</button>
        <input type="date" v-model="dateSelectionnee" @change="charger" class="sel" />
        <button class="btn-nav" type="button" @click="nextDay" aria-label="Jour suivant">▶</button>
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

      <!-- BLOC PAR CLIENT : vrai <table> HTML, meme pattern que Commandes/Referentiels -->
      <div v-for="commande in commandes" :key="commande.id" class="table-wrap client-block">
        <div class="client-name">
          <span>{{ commande.client_nom }}</span>
          <span class="commande-infos">
            N° {{ commande.numero_commande }}
            <template v-if="commande.date_commande"> · Cdé le {{ fmtDate(commande.date_commande) }}</template>
            · Livr. le {{ fmtDate(commande.date_livraison) }}
          </span>
        </div>

        <table>
          <thead>
            <tr>
              <th class="th-check"></th>
              <th>Désignation</th>
              <th>PCB</th>
              <th>Qté</th>
              <th>DLC</th>
              <th>N° lot</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="ligne in commande.lignes"
              :key="ligne.id"
              :class="['row', { done: etats[ligne.id]?.fait, unsure: ligne.certitude !== 'haute' }]"
            >
              <!-- Coche -->
              <td class="td-check">
                <input
                  type="checkbox"
                  class="check"
                  :checked="etats[ligne.id]?.fait"
                  @change="cocher(ligne, $event.target.checked)"
                />
              </td>

              <!-- Désignation -->
              <td class="td-produit">
                <div class="prodline">
                  <template v-if="ligne.certitude === 'non_fiable'">
                    <span class="unsure-label">⚠ ligne brute (chevauchement PDF, à relire) : "{{ ligne.ligne_brute }}"</span>
                  </template>

                  <template v-else>
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

                    <span v-if="ligne.tarif_net" class="prix-hint">
                      {{ Number(ligne.tarif_net).toFixed(2) }} € / {{ ligne.unite_tarif }}
                    </span>
                  </template>
                </div>
              </td>

              <!-- PCB -->
              <td>
                <input type="number" class="field pcb-input" maxlength="5" :value="(etats[ligne.id]?.pcb !== undefined && etats[ligne.id]?.pcb !== null) ? etats[ligne.id].pcb : (ligne.pcb !== null && ligne.pcb !== undefined ? ligne.pcb : '')" @change="majLignePcb(ligne, $event.target.value)" />
              </td>

              <!-- Qté -->
              <td class="num">{{ ligne.quantite }}</td>

              <!-- DLC -->
              <td>
                <input
                  type="date"
                  class="field field-dlc"
                  autocomplete="off"
                  :value="etats[ligne.id]?.dlc"
                  @input="majEtat(ligne.id, 'dlc', $event.target.value)"
                />
              </td>

              <!-- N° lot -->
              <td>
                <input
                  type="text"
                  class="field field-lot"
                  placeholder="Lot"
                  autocomplete="off"
                  :value="etats[ligne.id]?.lot"
                  @input="majEtat(ligne.id, 'lot', $event.target.value)"
                />
              </td>
            </tr>
          </tbody>
        </table>
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

function adjustDate(delta) {
  const d = new Date(dateSelectionnee.value + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  dateSelectionnee.value = d.toISOString().slice(0, 10);
  charger();
}
function prevDay() { adjustDate(-1); }
function nextDay() { adjustDate(1); }

const dateAffichee = computed(() =>
  new Date(dateSelectionnee.value + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
);

function fmtDate(d) {
  if (!d) return '—';
  // L'API peut renvoyer soit 'YYYY-MM-DD' soit un ISO complet avec heure
  // (ex: '2026-07-04T00:00:00.000Z') selon le driver MySQL — on ne garde
  // que la partie date pour eviter un "Invalid Date" en concatenant deux fois l'heure.
  const datePart = String(d).slice(0, 10);
  return new Date(datePart + 'T12:00:00').toLocaleDateString('fr-FR');
}

// ── Données ───────────────────────────────────────────────────────────────────
const commandes = ref([]);
const chargement = ref(true);
const etats = reactive({});          // { [ligneId]: { fait, dlc, lot, produit, ref } }
const editId = ref(null);            // id de la ligne dont la designation est en edition
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
          pcb:     ligne.pcb !== undefined && ligne.pcb !== null ? ligne.pcb : '',
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

// ── PCB sauvegarde immédiate (comme Commandes.vue) ─────────────────────────────
async function majLignePcb(ligne, valeur) {
  // trouver la commande parente
  let commandeId = null;
  for (const c of commandes.value) {
    if ((c.lignes || []).some(l => l.id === ligne.id)) { commandeId = c.id; break; }
  }
  if (!commandeId || !ligne?.id) return;
  let newVal = null;
  if (valeur !== '' && valeur !== null && valeur !== undefined) {
    const n = Number(valeur);
    newVal = Number.isNaN(n) ? null : n;
  }
  try {
    await api.patch(`/commandes/${commandeId}/lignes/${ligne.id}`, { pcb: newVal });
    // mettre à jour l'état local
    if (!etats[ligne.id]) etats[ligne.id] = {};
    etats[ligne.id].pcb = newVal;
    ligne.pcb = newVal;
    statutMsg.value = 'Enregistré ✓';
    statutClass.value = 'ok';
  } catch (e) {
    console.error('Échec sauvegarde PCB', e);
    statutMsg.value = 'Échec d\'enregistrement — ' + (e.message || '');
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
.page { max-width: 1100px; margin: 0 auto; padding: 24px 16px 60px; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
h1 { margin: 0; font-size: 1.4rem; color: #1a2a4a; }
.subtitle { margin: 2px 0 0; color: #7a8898; font-size: 0.85rem; text-transform: capitalize; }

.toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.sel { padding: 7px 10px; border: 1px solid #d0cbb8; border-radius: 6px; font-size: 0.85rem; background: white; }
.count-badge { background: #eef6ec; color: #2f6f4f; font-weight: 700; font-size: 0.82rem; padding: 5px 12px; border-radius: 20px; white-space: nowrap; }

.statut-line { margin: -8px 0 12px; font-size: 0.78rem; color: #2f6f4f; text-align: right; }
.statut-line.erreur { color: #b3261e; }

.legend { margin: 0 0 14px; font-size: 0.8rem; color: #7a8898; display: flex; gap: 16px; flex-wrap: wrap; }
.swatch { display: inline-block; width: 11px; height: 11px; border-radius: 2px; border: 1px solid #d8c400; margin-right: 4px; vertical-align: middle; background: #fff3a0; }

.etat { padding: 40px; text-align: center; color: #7a8898; }
.hint { font-size: 0.85rem; display: block; margin-top: 8px; }

/* Meme pattern exact que Commandes.vue / Referentiels.vue : une vraie table HTML
   dans un conteneur overflow-x:auto — aucun bug de scroll constate sur ce pattern. */
.client-block { background: white; border-radius: 10px; box-shadow: 0 1px 6px rgba(0,0,0,0.10); margin-bottom: 16px; overflow: visible; }
.client-name {
  font-weight: 700; color: #1a2a4a; font-size: 1rem;
  padding: 10px 14px; background: #f5f2e8;
  border-bottom: 2px solid #e8e3d5; border-radius: 10px 10px 0 0;
  display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 6px;
}

.client-block table { width: 100%; border-collapse: collapse; min-width: 0; }
.client-block th, .client-block td { padding: 8px 10px; vertical-align: middle; text-align: left; }
.client-block .th-check { width: 42px; }
/* Columns: 1=check, 2=designation (flex), 3=PCB, 4=Qté, 5=DLC, 6=N° lot */
.client-block th:nth-child(3), .client-block td:nth-child(3) { width: 5ch; max-width: 60px; }
.client-block th:nth-child(4), .client-block td:nth-child(4) { width: 5ch; max-width: 60px; text-align: right; }
.client-block th:nth-child(5), .client-block td:nth-child(5) { width: 11ch; max-width: 110px; }
.client-block th:nth-child(6), .client-block td:nth-child(6) { width: 12ch; max-width: 140px; }
.client-block td, .client-block th { word-break: break-word; }
.design-text, .prodline { white-space: normal; }
.pcb-input { width: 5ch; min-width: 48px; max-width: 60px; padding: 4px 6px; }

.commande-infos { font-size: 0.75rem; font-weight: 500; color: #7a8898; }

table { width: 100%; min-width: 480px; border-collapse: collapse; font-size: 0.9rem; }
thead { background: #f5f2e8; }
th { text-align: left; font-size: 0.71rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #5a6070; padding: 9px 14px; border-bottom: 2px solid #e8e3d5; white-space: nowrap; }
.th-check { width: 44px; }
.th-fields { width: 200px; }

td { padding: 10px 14px; border-bottom: 1px solid #f0ece0; vertical-align: middle; }
tr:last-child td { border-bottom: none; }
tr:hover td { background: #faf8f2; }
tr.done td { background: #eef6ec; }
tr.done:hover td { background: #e6f2e3; }
tr.done .prodline { text-decoration: line-through; color: #7a8a7a; opacity: 0.75; }
tr.unsure:not(.done) td { background: #fffaf0; }
tr.unsure:not(.done) .td-check { border-left: 3px solid #d8c400; }
tr.unsure:not(.done):hover td { background: #fff5e0; }

.check { width: 22px; height: 22px; accent-color: #2f6f4f; cursor: pointer; }

.prodline { white-space: nowrap; }
.qty { font-weight: 700; color: #1a2a4a; margin-right: 6px; white-space: nowrap; }

.design-text { cursor: text; padding: 1px 3px; border-radius: 3px; color: #1a1a1a; margin-right: 6px; }
.design-text.unsure { background: #fff3a0; padding: 1px 5px; border-radius: 3px; font-weight: 600; box-shadow: inset 0 0 0 1px #d8c400; }
.design-text:hover { outline: 1px dashed #d0cbb8; }

.product-input { font-size: 0.9rem; border: 1px solid #2f6f4f; border-radius: 6px; padding: 4px 8px; min-width: 140px; background: white; margin-right: 6px; vertical-align: middle; }
.product-input.unsure { background: #fff3a0; border-color: #d8c400; }
.product-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(47,111,79,0.2); }


.prix-hint { font-size: 0.75rem; color: #2f6f4f; font-weight: 600; white-space: nowrap; }
.unsure-label { background: #fff3a0; padding: 4px 8px; border-radius: 4px; font-size: 0.82rem; font-weight: 600; color: #7a6000; white-space: pre-wrap; box-shadow: inset 0 0 0 1px #d8c400; }

.fields { display: flex; gap: 6px; }
.field {
  border: 1px solid #d0cbb8; border-radius: 6px; padding: 7px 8px;
  font-size: 0.85rem; font-weight: 600; color: #1a2a4a; background: white; text-align: center;
}
.field::placeholder { color: #a89b7a; font-weight: 500; }
.field:hover { border-color: #2f6f4f; }
.field:focus { outline: none; border-color: #2f6f4f; box-shadow: 0 0 0 2px rgba(47,111,79,0.2); }
.field-dlc { width: 130px; }
.field-lot { width: 60px; }

.footer-note { margin: 18px 0 0; font-size: 0.78rem; color: #7a8898; }
.reset-btn { background: #b3261e; color: white; border: none; padding: 8px 18px; border-radius: 6px; font-size: 0.85rem; font-weight: 600; cursor: pointer; }
.reset-btn:hover { background: #8e1a14; }

@media (max-width: 480px) {
  h1 { font-size: 1.2rem; }
  .toolbar { gap: 8px; }
}
</style>