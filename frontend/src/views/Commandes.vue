<template>
  <div class="page">
    <div class="page-header">
      <div><h1>Commandes</h1><p class="sub">Historique par date de livraison</p></div>
      <div class="toolbar">
        <select v-model="filtres.annee" @change="charger" class="sel">
          <option value="">Toutes années</option>
          <option v-for="a in annees" :key="a" :value="a">{{ a }}</option>
        </select>
        <select v-model="filtres.mois" @change="charger" class="sel">
          <option value="">Tous mois</option>
          <option v-for="m in mois" :key="m.v" :value="m.v">{{ m.l }}</option>
        </select>
        <button class="btn-ico" type="button" title="Produits période" @click="ouvrirProduitsPeriode">🧀</button>
        <button class="btn primary" @click="ouvrir()">+ Ajouter</button>
      </div>
    </div>

    <div v-if="chargement" class="etat">Chargement…</div>
    <div v-else-if="!commandes.length" class="etat">Aucune commande pour cette période.</div>

    <div v-else class="table-wrap">
      <table>
        <thead><tr><th>N° commande</th><th>Client</th><th>Commande le</th><th>Livraison</th><th>Statut</th><th>Source</th><th></th></tr></thead>
        <tbody>
          <tr v-for="c in commandes" :key="c.id">
            <td class="mono">{{ c.numero_commande }}</td>
            <td><strong>{{ c.client_nom }}</strong></td>
            <td>{{ fmtDate(c.date_commande) }}</td>
            <td><strong>{{ fmtDate(c.date_livraison) }}</strong></td>
            <td>
              <select class="statut-sel" :value="c.statut" @change="patchStatut(c, $event.target.value)">
                <option value="brouillon">Brouillon</option>
                <option value="a_verifier">À vérifier</option>
                <option value="validee">Validée</option>
                <option value="archivee">Archivée</option>
              </select>
            </td>
            <td><span :class="['badge-src', c.source]">{{ c.source }}</span></td>
            <td class="act">
              <button class="btn-ico" title="Lignes" @click="voirLignes(c)">👁</button>
              <button class="btn-ico" title="Modifier" @click="ouvrir(c)">✏️</button>
              <button class="btn-ico rouge" title="Supprimer" @click="suppr.item = c; suppr.visible = true">✕</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Panneau lignes -->
    <div v-if="panel.visible" class="panel-overlay" @click.self="panel.visible = false">
      <div class="panel">
        <div class="panel-head">
          <h2>{{ panel.commande?.client_nom }} — N° {{ panel.commande?.numero_commande }}</h2>
          <div style="display:flex;gap:8px">
            <button class="btn primary small" @click="ajouterLigne">+ Ligne</button>
            <button class="btn-ico" @click="panel.visible = false">✕</button>
          </div>
        </div>
        <div v-if="panel.chargement" class="etat">Chargement…</div>
        <table v-else class="tbl-lignes">
          <thead><tr><th>Désignation</th><th>PCB</th><th>Qté</th><th>DLC</th><th>N° lot</th></tr></thead>
          <tbody>
            <tr v-for="l in panel.lignes" :key="l.id">
              <td>{{ l.designation_brute }}</td>
              <td class="mono">{{ l.pcb || '—' }}</td>
              <td class="num">{{ l.quantite }}</td>
              <td>
                <input type="date" class="field field-dlc" :value="(l.dlc || '').slice(0,10)" @change="majLigneDlc(l, $event.target.value)" />
              </td>
              <td>
                <input type="text" class="field" :value="l.numero_lot || ''" @change="majLigneLot(l, $event.target.value)" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Panel produits consolidés pour la période -->
    <div v-if="panelProduitsPeriodeOuvert" class="panel-overlay" @click.self="fermerPanelProduitsPeriode">
      <div class="panel">
        <div class="panel-head">
          <h2>Produits — {{ titrePeriode }}</h2>
          <button class="btn-ico" type="button" @click="fermerPanelProduitsPeriode" aria-label="Fermer">✕</button>
        </div>

        <div v-if="chargementProduitsPeriode" class="etat">Chargement…</div>

        <table v-else class="tbl-lignes">
          <thead><tr><th>Désignation</th><th>Qté</th><th>Unité</th></tr></thead>
          <tbody>
            <tr v-for="(p, idx) in produitsPeriode" :key="p.code || p.designation || idx">
              <td>{{ p.designation }}</td>
              <td class="num">{{ p.quantite }}</td>
              <td>{{ p.unite || '—' }}</td>
            </tr>
            <tr v-if="!produitsPeriode.length">
              <td colspan="3" class="empty-line">Aucun produit pour cette période.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal commande -->
    <Modal v-if="modal.visible" :titre="modal.item ? 'Modifier la commande' : 'Nouvelle commande'"
      @close="modal.visible = false" @confirm="sauvegarder">
      <label>Client
        <select v-model="form.client_id" class="inp">
          <option v-for="c in clients" :key="c.id" :value="c.id">{{ c.nom }}</option>
        </select>
      </label>
      <label>N° commande <input v-model="form.numero_commande" class="inp" /></label>
      <label>Date commande <input v-model="form.date_commande" type="date" class="inp" /></label>
      <label>Date livraison <input v-model="form.date_livraison" type="date" class="inp" /></label>
      <label>Statut
        <select v-model="form.statut" class="inp">
          <option value="brouillon">Brouillon</option>
          <option value="a_verifier">À vérifier</option>
          <option value="validee">Validée</option>
          <option value="archivee">Archivée</option>
        </select>
      </label>
      <label>Source
        <select v-model="form.source" class="inp">
          <option value="manuel">Manuel</option>
          <option value="gmail">Gmail</option>
        </select>
      </label>
    </Modal>

    <!-- Modal ligne -->
    <Modal v-if="modalLigne.visible" :titre="modalLigne.item ? 'Modifier la ligne' : 'Nouvelle ligne'"
      @close="modalLigne.visible = false" @confirm="sauvegarderLigne">
      <label>Désignation <input v-model="formLigne.designation_brute" class="inp" /></label>
      <label>Quantité <input v-model.number="formLigne.quantite" type="number" class="inp" /></label>
      <label>Unité <input v-model="formLigne.unite" class="inp" /></label>
      <label>Code interne <input v-model="formLigne.code_interne" class="inp" /></label>
      <label>Certitude
        <select v-model="formLigne.certitude" class="inp">
          <option value="haute">Haute</option>
          <option value="a_verifier">À vérifier</option>
          <option value="non_fiable">Non fiable</option>
        </select>
      </label>
    </Modal>

    <ConfirmSuppr v-if="suppr.visible"
      :message="`Supprimer la commande N° ${suppr.item?.numero_commande} ?`"
      @annuler="suppr.visible = false"
      @confirmer="confirmerSuppr" />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue';
import { api } from '../services/api';
import Modal from '../components/Modal.vue';
import ConfirmSuppr from '../components/ConfirmSuppr.vue';

const commandes = ref([]);
const clients = ref([]);
const chargement = ref(true);
const filtres = reactive({ annee: new Date().getFullYear(), mois: '' });
const modal = reactive({ visible: false, item: null });
const form = ref({});
const suppr = reactive({ visible: false, item: null });
const panel = reactive({ visible: false, commande: null, lignes: [], chargement: false });

async function majLigneDlc(ligne, valeur) {
  if (!panel.commande?.id || !ligne?.id) return;
  try {
    await api.patch('/commandes/' + panel.commande.id + '/lignes/' + ligne.id, { dlc: valeur || null });
    // Mise à jour locale
    ligne.dlc = valeur || null;
  } catch (e) {
    console.error('Échec sauvegarde DLC', e);
  }
}

async function majLigneLot(ligne, valeur) {
  if (!panel.commande?.id || !ligne?.id) return;
  try {
    await api.patch('/commandes/' + panel.commande.id + '/lignes/' + ligne.id, { numero_lot: valeur || null });
    ligne.numero_lot = valeur || null;
  } catch (e) {
    console.error('Échec sauvegarde N° lot', e);
  }
}

// panel produits periode
const panelProduitsPeriodeOuvert = ref(false);
const produitsPeriode = ref([]);
const chargementProduitsPeriode = ref(false);

const modalLigne = reactive({ visible: false, item: null });

function titrePeriodeLabel() {
  if (!filtres.annee && !filtres.mois) return 'Toutes commandes';
  if (filtres.annee && !filtres.mois) return 'Année ' + filtres.annee;
  if (filtres.annee && filtres.mois) {
    const m = mois.find(x => x.v === filtres.mois);
    return (m ? m.l : filtres.mois) + ' ' + filtres.annee;
  }
  return 'Période';
}

const titrePeriode = computed(() => titrePeriodeLabel());

async function ouvrirProduitsPeriode() {
  panelProduitsPeriodeOuvert.value = true;
  chargementProduitsPeriode.value = true;
  produitsPeriode.value = [];

  try {
    const ids = Array.from(new Set((commandes.value || []).map(c => c.id).filter(Boolean)));
    if (!ids.length) { produitsPeriode.value = []; return; }

    const promesses = ids.map(id => api.get('/commandes/' + id).catch(() => null));
    const details = await Promise.all(promesses);
    const toutesLignes = [];
    details.forEach(d => {
      if (d && Array.isArray(d.lignes)) d.lignes.forEach(l => toutesLignes.push(l));
    });

    const map = new Map();
    toutesLignes.forEach(l => {
      const key = (l.code_interne && String(l.code_interne).trim()) || (l.designation_brute && String(l.designation_brute).trim()) || '__inconnu__';
      const quant = Number(l.quantite) || 0;
      if (!map.has(key)) {
        map.set(key, { designation: l.designation_brute || l.reference || key, code: l.code_interne, quantite: quant, unite: l.unite || '' });
      } else {
        const cur = map.get(key);
        cur.quantite = (Number(cur.quantite) || 0) + quant;
      }
    });

    const liste = Array.from(map.values()).sort((a,b) => String(a.designation).localeCompare(String(b.designation), 'fr'));
    produitsPeriode.value = liste;
  } finally {
    chargementProduitsPeriode.value = false;
  }
}

function fermerPanelProduitsPeriode() {
  panelProduitsPeriodeOuvert.value = false;
  produitsPeriode.value = [];
  chargementProduitsPeriode.value = false;
}
const formLigne = ref({});

const annees = [2024, 2025, 2026, 2027];
const mois = [
  { v: '01', l: 'Janvier' }, { v: '02', l: 'Février' }, { v: '03', l: 'Mars' },
  { v: '04', l: 'Avril' }, { v: '05', l: 'Mai' }, { v: '06', l: 'Juin' },
  { v: '07', l: 'Juillet' }, { v: '08', l: 'Août' }, { v: '09', l: 'Septembre' },
  { v: '10', l: 'Octobre' }, { v: '11', l: 'Novembre' }, { v: '12', l: 'Décembre' },
];

const fmtDate = d => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

async function charger() {
  chargement.value = true;
  const p = new URLSearchParams();
  if (filtres.annee) p.set('annee', filtres.annee);
  if (filtres.mois)  p.set('mois', filtres.mois);
  commandes.value = await api.get('/commandes?' + p);
  chargement.value = false;
}

async function voirLignes(c) {
  panel.commande = c; panel.visible = true; panel.chargement = true;
  const data = await api.get('/commandes/' + c.id);
  panel.lignes = data.lignes || [];
  panel.chargement = false;
}

function ouvrir(item = null) {
  modal.item = item;
  form.value = item
    ? { ...item }
    : { client_id: '', numero_commande: '', date_commande: '', date_livraison: '', statut: 'brouillon', source: 'manuel' };
  modal.visible = true;
}

async function sauvegarder() {
  if (modal.item) {
    await api.patch('/commandes/' + modal.item.id, form.value);
    Object.assign(modal.item, form.value);
    const client = clients.value.find(c => c.id == form.value.client_id);
    if (client) modal.item.client_nom = client.nom;
  } else {
    const n = await api.post('/commandes', form.value);
    const client = clients.value.find(c => c.id == form.value.client_id);
    commandes.value.unshift({ ...n, client_nom: client?.nom || '' });
  }
  modal.visible = false;
}

async function patchStatut(c, statut) {
  await api.patch('/commandes/' + c.id, { statut }); c.statut = statut;
}

async function confirmerSuppr() {
  await api.delete('/commandes/' + suppr.item.id);
  commandes.value = commandes.value.filter(c => c.id !== suppr.item.id);
  suppr.visible = false;
}

function ajouterLigne() {
  modalLigne.item = null;
  formLigne.value = { designation_brute: '', quantite: '', unite: '', code_interne: '', certitude: 'a_verifier' };
  modalLigne.visible = true;
}

function editerLigne(l) {
  modalLigne.item = l;
  formLigne.value = { ...l };
  modalLigne.visible = true;
}

async function sauvegarderLigne() {
  const cid = panel.commande.id;
  if (modalLigne.item) {
    await api.patch('/commandes/' + cid + '/lignes/' + modalLigne.item.id, formLigne.value);
    Object.assign(modalLigne.item, formLigne.value);
  } else {
    const n = await api.post('/commandes/' + cid + '/lignes', formLigne.value);
    panel.lignes.push(n);
  }
  modalLigne.visible = false;
}

async function supprimerLigne(l) {
  if (!confirm('Supprimer cette ligne ?')) return;
  await api.delete('/commandes/' + panel.commande.id + '/lignes/' + l.id);
  panel.lignes = panel.lignes.filter(x => x.id !== l.id);
}

onMounted(async () => {
  clients.value = await api.get('/referentiels/clients');
  await charger();
});
</script>

<style scoped>
.page { max-width: 1200px; margin: 0 auto; padding: 24px 16px; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
h1 { margin: 0; font-size: 1.4rem; color: #1a2a4a; }
.sub { margin: 2px 0 0; color: #7a8898; font-size: 0.85rem; }
.toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.sel { padding: 7px 10px; border: 1px solid #d0cbb8; border-radius: 6px; font-size: 0.85rem; background: white; }
.etat { padding: 40px; text-align: center; color: #7a8898; }
.table-wrap { background: white; border-radius: 10px; box-shadow: 0 1px 6px rgba(0,0,0,0.10); overflow: auto; }
table { width: 100%; border-collapse: collapse; font-size: 0.855rem; }
thead { background: #f5f2e8; }
th { padding: 9px 14px; text-align: left; font-size: 0.71rem; text-transform: uppercase; letter-spacing: 0.05em; color: #5a6070; font-weight: 600; border-bottom: 2px solid #e8e3d5; white-space: nowrap; }
td { padding: 9px 14px; border-bottom: 1px solid #f0ece0; vertical-align: middle; }
tr:last-child td { border-bottom: none; }
tr:hover { background: #faf8f2; }
.mono { font-family: monospace; font-size: 0.82rem; color: #4a7a5a; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.act { display: flex; gap: 4px; }
.btn-ico { border: none; background: transparent; cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 0.88rem; }
.btn-ico:hover { background: #f0ece0; }
.btn-ico.rouge:hover { background: #fde8e8; color: #b3261e; }
.btn { padding: 8px 18px; border-radius: 6px; border: none; font-size: 0.85rem; cursor: pointer; font-weight: 600; }
.btn.primary { background: #2f6f4f; color: white; }
.btn.small { padding: 5px 12px; font-size: 0.8rem; }
.statut-sel { border: none; background: transparent; font-size: 0.82rem; cursor: pointer; color: #1a2a4a; padding: 3px 4px; border-radius: 4px; }
.statut-sel:hover { background: #f0ece0; }
.badge-src { font-size: 0.72rem; padding: 2px 8px; border-radius: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
.badge-src.gmail { background: #e8f0fe; color: #1a56b0; }
.badge-src.manuel { background: #f0ece0; color: #5a4a30; }
.panel-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.35); z-index: 100; display: flex; justify-content: flex-end; }
.panel { width: 640px; max-width: 95vw; background: white; height: 100%; overflow-y: auto; box-shadow: -4px 0 20px rgba(0,0,0,0.15); }
.panel-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #e8e3d5; position: sticky; top: 0; background: white; z-index: 1; }
.panel-head h2 { margin: 0; font-size: 1rem; color: #1a2a4a; }
.tbl-lignes { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.tbl-lignes th { padding: 8px 14px; text-align: left; font-size: 0.71rem; text-transform: uppercase; color: #7a8898; border-bottom: 2px solid #e8e3d5; }
.tbl-lignes td { padding: 9px 14px; border-bottom: 1px solid #f0ece0; }
label { display: flex; flex-direction: column; gap: 5px; font-size: 0.85rem; font-weight: 600; color: #3a4a5a; }
.inp { padding: 8px 10px; border: 1px solid #d0cbb8; border-radius: 6px; font-size: 0.875rem; width: 100%; box-sizing: border-box; }
.inp:focus { outline: none; border-color: #2f6f4f; box-shadow: 0 0 0 2px rgba(47,111,79,0.2); }
</style>
