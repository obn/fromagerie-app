<template>
  <div class="page">
    <div class="page-header">
      <h1>Référentiels</h1>
      <div class="tabs">
        <button v-for="t in onglets" :key="t.id"
          :class="['tab', { active: onglet === t.id }]"
          @click="changerOnglet(t.id)">
          {{ t.label }}
          <span v-if="t.count !== undefined" class="count">{{ t.count }}</span>
        </button>
      </div>
    </div>

    <!-- ── CLIENTS ── -->
    <section v-if="onglet === 'clients'">
      <div class="toolbar">
        <input v-model="q.clients" placeholder="Rechercher…" class="search" />
        <button class="btn primary" @click="ouvrir('clients')">+ Ajouter</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Nom</th><th>Nom facture</th><th>Jour fixe livraison</th><th>Actif</th><th></th></tr></thead>
          <tbody>
            <tr v-for="c in filtres.clients" :key="c.id">
              <td><strong>{{ c.nom }}</strong></td>
              <td>{{ c.nom_facture || '—' }}</td>
              <td>{{ c.jour_fixe_livraison || '—' }}</td>
              <td><span :class="['badge', c.actif ? 'vert' : 'gris']">{{ c.actif ? 'Actif' : 'Inactif' }}</span></td>
              <td class="act">
                <button class="btn-ico" @click="ouvrir('clients', c)">✏️</button>
                <button class="btn-ico rouge" @click="demanderSuppr('clients', c, c.nom)">✕</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ── PRODUITS ── -->
    <section v-if="onglet === 'produits'">
      <div class="toolbar">
        <input v-model="q.produits" placeholder="Rechercher gencod ou désignation…" class="search" />
        <button class="btn primary" @click="ouvrir('produits')">+ Ajouter</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Gencod</th><th>Réf. Zacher</th><th>Désignation</th><th>Unité</th><th>DLUO (j)</th><th>Actif</th><th></th></tr></thead>
          <tbody>
            <tr v-for="p in filtres.produits" :key="p.id">
              <td class="mono">{{ p.gencod }}</td>
              <td class="mono">{{ p.ref_zacher || '—' }}</td>
              <td>{{ p.designation }}</td>
              <td>{{ p.unite || '—' }}</td>
              <td class="num">{{ p.dluo_jours ?? '—' }}</td>
              <td><span :class="['badge', p.actif ? 'vert' : 'gris']">{{ p.actif ? 'Actif' : 'Inactif' }}</span></td>
              <td class="act">
                <button class="btn-ico" @click="ouvrir('produits', p)">✏️</button>
                <button class="btn-ico rouge" @click="demanderSuppr('produits', p, p.designation)">✕</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ── TARIFS ── -->
    <section v-if="onglet === 'tarifs'">
      <div class="toolbar">
        <select v-model="q.tarifClient" @change="chargerTarifs" class="search">
          <option value="">Tous les clients</option>
          <option v-for="c in data.clients" :key="c.id" :value="c.id">{{ c.nom }}</option>
        </select>
        <input v-model="q.tarifs" placeholder="Rechercher produit…" class="search" />
        <button class="btn primary" @click="ouvrir('tarifs')">+ Ajouter</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Client</th><th>Désignation</th><th>Gencod</th><th>PCB</th><th>Tarif gén.</th><th>Remise %</th><th>Tarif net</th><th>Unité</th><th></th></tr></thead>
          <tbody>
            <tr v-for="t in filtres.tarifs" :key="t.id">
              <td>{{ t.client_nom }}</td>
              <td>{{ t.designation }}</td>
              <td class="mono">{{ t.gencod }}</td>
              <td class="num">{{ t.pcb ?? '—' }}</td>
              <td class="num">{{ fmt(t.tarif_general) }}</td>
              <td class="num">{{ t.remise_pct ? Number(t.remise_pct).toFixed(2) + ' %' : '—' }}</td>
              <td class="num prix">{{ fmt(t.tarif_net) }}</td>
              <td>{{ t.unite_facturation || '—' }}</td>
              <td class="act">
                <button class="btn-ico" @click="ouvrir('tarifs', t)">✏️</button>
                <button class="btn-ico rouge" @click="demanderSuppr('tarifs', t, t.designation + ' / ' + t.client_nom)">✕</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ── CODES INTERNES ── -->
    <section v-if="onglet === 'codes'">
      <div class="toolbar">
        <select v-model="q.codesClient" @change="chargerCodes" class="search">
          <option value="">Tous les clients</option>
          <option v-for="c in data.clients" :key="c.id" :value="c.id">{{ c.nom }}</option>
        </select>
        <input v-model="q.codes" placeholder="Rechercher code ou produit…" class="search" />
        <button class="btn primary" @click="ouvrir('codes')">+ Ajouter</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Client</th><th>Code interne</th><th>Produit lié</th><th>Gencod</th><th></th></tr></thead>
          <tbody>
            <tr v-for="c in filtres.codes" :key="c.id">
              <td>{{ c.client_nom }}</td>
              <td class="mono">{{ c.code_interne }}</td>
              <td><span v-if="c.designation">{{ c.designation }}</span><span v-else class="muted">Non résolu</span></td>
              <td class="mono">{{ c.gencod || '—' }}</td>
              <td class="act">
                <button class="btn-ico" @click="ouvrir('codes', c)">✏️</button>
                <button class="btn-ico rouge" @click="demanderSuppr('codes', c, c.code_interne)">✕</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ── CATALOGUE INTERNE ── -->
    <section v-if="onglet === 'interne'">
      <div class="toolbar">
        <select v-model="q.famille" class="search">
          <option value="">Toutes les familles</option>
          <option v-for="f in data.familles" :key="f.code" :value="f.code">{{ f.code }} — {{ f.libelle }}</option>
        </select>
        <input v-model="q.interne" placeholder="Code ou libellé…" class="search" />
        <button class="btn primary" @click="ouvrir('interne')">+ Ajouter</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Code interne</th><th>Libellé</th><th>Famille</th><th></th></tr></thead>
          <tbody>
            <tr v-for="r in filtres.interne" :key="r.code_interne">
              <td class="mono">{{ r.code_interne }}</td>
              <td>{{ r.libelle_produit }}</td>
              <td><span class="badge gris">{{ r.famille_code }} — {{ r.famille_libelle }}</span></td>
              <td class="act">
                <button class="btn-ico" @click="ouvrir('interne', r)">✏️</button>
                <button class="btn-ico rouge" @click="demanderSuppr('interne', r, r.code_interne)">✕</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ── MODAL FORMULAIRE ── -->
    <Modal v-if="modal.visible" :titre="modal.titre" @close="modal.visible = false" @confirm="sauvegarder">
      <!-- Clients -->
      <template v-if="modal.type === 'clients'">
        <label>Nom <input v-model="form.nom" class="inp" /></label>
      <label>Nom facture <input v-model="form.nom_facture" class="inp" placeholder="Optionnel — si different du nom" /></label>
      <label>Jour fixe livraison
        <select v-model="form.jour_fixe_livraison" class="inp">
          <option value="">— Aucun —</option>
          <option value="lundi">lundi</option>
          <option value="mardi">mardi</option>
          <option value="mercredi">mercredi</option>
          <option value="jeudi">jeudi</option>
          <option value="vendredi">vendredi</option>
          <option value="samedi">samedi</option>
          <option value="dimanche">dimanche</option>
        </select>
      </label>
      <label class="row-check"><input type="checkbox" v-model="form.actif" /> Actif</label>
      </template>
      <!-- Produits -->
      <template v-if="modal.type === 'produits'">
        <label>Gencod <input v-model="form.gencod" class="inp" :disabled="!!modal.item" /></label>
        <label>Désignation <input v-model="form.designation" class="inp" /></label>
        <label>Unité <input v-model="form.unite" placeholder="Kg, Pièce…" class="inp" /></label>
        <label>DLUO (jours) <input v-model.number="form.dluo_jours" type="number" class="inp" /></label>
        <label class="row-check"><input type="checkbox" v-model="form.actif" /> Actif</label>
      </template>
      <!-- Tarifs -->
      <template v-if="modal.type === 'tarifs'">
        <label>Client
          <select v-model="form.client_id" class="inp">
            <option v-for="c in data.clients" :key="c.id" :value="c.id">{{ c.nom }}</option>
          </select>
        </label>
        <label>Produit
          <select v-model="form.produit_id" class="inp">
            <option v-for="p in data.produits" :key="p.id" :value="p.id">{{ p.designation }}</option>
          </select>
        </label>
        <label>PCB <input v-model.number="form.pcb" type="number" class="inp" /></label>
        <label>Tarif général <input v-model.number="form.tarif_general" type="number" step="0.01" class="inp" /></label>
        <label>Remise % <input v-model.number="form.remise_pct" type="number" step="0.01" class="inp" /></label>
        <label>Tarif net <input v-model.number="form.tarif_net" type="number" step="0.01" class="inp" /></label>
        <label>Unité facturation <input v-model="form.unite_facturation" placeholder="Kg, Pièce…" class="inp" /></label>
      </template>
      <!-- Codes internes -->
      <template v-if="modal.type === 'codes'">
        <label>Client
          <select v-model="form.client_id" class="inp">
            <option v-for="c in data.clients" :key="c.id" :value="c.id">{{ c.nom }}</option>
          </select>
        </label>
        <label>Code interne <input v-model="form.code_interne" class="inp" :disabled="!!modal.item" /></label>
        <label>Produit lié (optionnel)
          <select v-model="form.produit_id" class="inp">
            <option value="">— Non résolu —</option>
            <option v-for="p in data.produits" :key="p.id" :value="p.id">{{ p.designation }} ({{ p.gencod }})</option>
          </select>
        </label>
      </template>
      <!-- Catalogue interne -->
      <template v-if="modal.type === 'interne'">
        <label>Code interne <input v-model="form.code_interne" class="inp" :disabled="!!modal.item" /></label>
        <label>Libellé <input v-model="form.libelle_produit" class="inp" /></label>
        <label>Famille
          <select v-model="form.famille_code" class="inp">
            <option v-for="f in data.familles" :key="f.code" :value="f.code">{{ f.code }} — {{ f.libelle }}</option>
          </select>
        </label>
      </template>
    </Modal>

    <!-- ── CONFIRMATION SUPPRESSION ── -->
    <ConfirmSuppr v-if="suppr.visible"
      :message="`Supprimer « ${suppr.label} » ?`"
      @annuler="suppr.visible = false"
      @confirmer="confirmerSuppr" />

  </div>
</template>

<script setup>
import { ref, computed, onMounted, reactive } from 'vue';
import { api } from '../services/api';
import Modal from '../components/Modal.vue';
import ConfirmSuppr from '../components/ConfirmSuppr.vue';

const onglet = ref('clients');
const data = reactive({ clients: [], produits: [], tarifs: [], codes: [], familles: [], interne: [] });
const q = reactive({ clients: '', produits: '', tarifs: '', tarifClient: '', codes: '', codesClient: '', interne: '', famille: '' });
const modal = reactive({ visible: false, type: '', titre: '', item: null });
const form = ref({});
const suppr = reactive({ visible: false, type: '', item: null, label: '' });

const onglets = computed(() => [
  { id: 'clients',  label: 'Clients',   count: data.clients.length },
  { id: 'produits', label: 'Produits',  count: data.produits.length },
  { id: 'tarifs',   label: 'Tarifs',    count: data.tarifs.length },
  { id: 'codes',    label: 'Codes internes', count: data.codes.length },
  { id: 'interne',  label: 'Catalogue interne', count: data.interne.length },
]);

const filtres = computed(() => ({
  clients: data.clients.filter(c => c.nom.toLowerCase().includes(q.clients.toLowerCase())),
  produits: data.produits.filter(p =>
    p.designation.toLowerCase().includes(q.produits.toLowerCase()) || (p.gencod || '').includes(q.produits) || (p.ref_zacher || '').toLowerCase().includes(q.produits.toLowerCase())),
  tarifs: data.tarifs.filter(t =>
    t.designation.toLowerCase().includes(q.tarifs.toLowerCase()) || t.gencod?.includes(q.tarifs)),
  codes: data.codes.filter(c =>
    c.code_interne.toLowerCase().includes(q.codes.toLowerCase()) ||
    (c.designation || '').toLowerCase().includes(q.codes.toLowerCase())),
  interne: data.interne.filter(r =>
    (!q.famille || r.famille_code == q.famille) &&
    (r.code_interne.toLowerCase().includes(q.interne.toLowerCase()) ||
     r.libelle_produit.toLowerCase().includes(q.interne.toLowerCase()))),
}));

const fmt = v => v ? Number(v).toFixed(2) + ' €' : '—';

async function chargerClients()  { data.clients  = await api.get('/referentiels/clients'); }
async function chargerProduits() { data.produits = await api.get('/referentiels/produits'); }
async function chargerTarifs()   {
  const p = q.tarifClient ? '?client_id=' + q.tarifClient : '';
  data.tarifs = await api.get('/referentiels/tarifs' + p);
}
async function chargerCodes()    {
  const p = q.codesClient ? '?client_id=' + q.codesClient : '';
  data.codes = await api.get('/referentiels/codes-internes' + p);
}
async function chargerInterne()  {
  const r = await api.get('/referentiels/interne');
  data.familles = r.familles; data.interne = r.produits;
}

async function changerOnglet(id) {
  onglet.value = id;
  if (id === 'clients'  && !data.clients.length)  await chargerClients();
  if (id === 'produits' && !data.produits.length) await chargerProduits();
  if (id === 'tarifs')   await chargerTarifs();
  if (id === 'codes')    await chargerCodes();
  if (id === 'interne')  await chargerInterne();
}

function ouvrir(type, item = null) {
  modal.type = type;
  modal.item = item;
  modal.titre = item ? 'Modifier' : 'Ajouter';
  modal.visible = true;
  form.value = item ? { ...item } : defaultForm(type);
}

function defaultForm(type) {
  if (type === 'clients')  return { nom: '', nom_facture: '', jour_fixe_livraison: '', actif: true };
  if (type === 'produits') return { gencod: '', designation: '', unite: '', dluo_jours: null, actif: true };
  if (type === 'tarifs')   return { client_id: '', produit_id: '', pcb: null, tarif_general: null, remise_pct: null, tarif_net: null, unite_facturation: '' };
  if (type === 'codes')    return { client_id: '', code_interne: '', produit_id: '' };
  if (type === 'interne')  return { code_interne: '', libelle_produit: '', famille_code: '' };
  return {};
}

async function sauvegarder() {
  const t = modal.type;
  const item = modal.item;
  const body = { ...form.value };
  if (body.produit_id === '') body.produit_id = null;

  if (t === 'clients') {
    if (item) { await api.patch('/referentiels/clients/' + item.id, body); Object.assign(item, body); }
    else { const n = await api.post('/referentiels/clients', body); data.clients.push(n); }
  } else if (t === 'produits') {
    if (item) { await api.patch('/referentiels/produits/' + item.id, body); Object.assign(item, body); }
    else { const n = await api.post('/referentiels/produits', body); data.produits.push(n); }
  } else if (t === 'tarifs') {
    if (item) { await api.patch('/referentiels/tarifs/' + item.id, body); await chargerTarifs(); }
    else { await api.post('/referentiels/tarifs', body); await chargerTarifs(); }
  } else if (t === 'codes') {
    if (item) { await api.patch('/referentiels/codes-internes/' + item.id, body); await chargerCodes(); }
    else { await api.post('/referentiels/codes-internes', body); await chargerCodes(); }
  } else if (t === 'interne') {
    if (item) { await api.patch('/referentiels/interne/produits/' + item.code_interne, body); await chargerInterne(); }
    else { await api.post('/referentiels/interne/produits', body); await chargerInterne(); }
  }
  modal.visible = false;
}

function demanderSuppr(type, item, label) {
  suppr.type = type; suppr.item = item; suppr.label = label; suppr.visible = true;
}

async function confirmerSuppr() {
  const { type, item } = suppr;
  if (type === 'clients')  { await api.delete('/referentiels/clients/' + item.id); data.clients = data.clients.filter(c => c.id !== item.id); }
  if (type === 'produits') { await api.delete('/referentiels/produits/' + item.id); data.produits = data.produits.filter(p => p.id !== item.id); }
  if (type === 'tarifs')   { await api.delete('/referentiels/tarifs/' + item.id); await chargerTarifs(); }
  if (type === 'codes')    { await api.delete('/referentiels/codes-internes/' + item.id); await chargerCodes(); }
  if (type === 'interne')  { await api.delete('/referentiels/interne/produits/' + item.code_interne); await chargerInterne(); }
  suppr.visible = false;
}

onMounted(chargerClients);
</script>

<style scoped>
.page { max-width: 1200px; margin: 0 auto; padding: 24px 16px; }
.page-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
h1 { margin: 0; font-size: 1.4rem; color: #1a2a4a; }
.tabs { display: flex; gap: 3px; background: #f0ece0; border-radius: 8px; padding: 4px; flex-wrap: wrap; }
.tab { border: none; background: transparent; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 0.83rem; color: #5a6070; font-weight: 500; display: flex; align-items: center; gap: 5px; }
.tab.active { background: white; color: #1a2a4a; font-weight: 700; box-shadow: 0 1px 4px rgba(0,0,0,0.12); }
.count { background: #e0dbd0; color: #5a4a30; border-radius: 10px; padding: 1px 7px; font-size: 0.72rem; font-weight: 700; }
.tab.active .count { background: #2f6f4f; color: white; }
.toolbar { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; align-items: center; }
.search { padding: 8px 12px; border: 1px solid #d0cbb8; border-radius: 6px; font-size: 0.85rem; background: white; min-width: 180px; }
.btn { padding: 8px 18px; border-radius: 6px; border: none; font-size: 0.85rem; cursor: pointer; font-weight: 600; }
.btn.primary { background: #2f6f4f; color: white; }
.table-wrap { background: white; border-radius: 10px; box-shadow: 0 1px 6px rgba(0,0,0,0.10); overflow: auto; }
table { width: 100%; border-collapse: collapse; font-size: 0.855rem; }
thead { background: #f5f2e8; }
th { padding: 9px 14px; text-align: left; font-size: 0.71rem; text-transform: uppercase; letter-spacing: 0.05em; color: #5a6070; font-weight: 600; border-bottom: 2px solid #e8e3d5; white-space: nowrap; }
td { padding: 9px 14px; border-bottom: 1px solid #f0ece0; vertical-align: middle; }
tr:last-child td { border-bottom: none; }
tr:hover { background: #faf8f2; }
.mono { font-family: monospace; font-size: 0.82rem; color: #4a7a5a; }
.num { font-variant-numeric: tabular-nums; text-align: right; }
.prix { font-weight: 700; color: #1a2a4a; }
.muted { color: #9a9a9a; font-style: italic; }
.act { display: flex; gap: 4px; }
.btn-ico { border: none; background: transparent; cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 0.88rem; }
.btn-ico:hover { background: #f0ece0; }
.btn-ico.rouge:hover { background: #fde8e8; color: #b3261e; }
.badge { font-size: 0.72rem; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
.badge.vert { background: #eef6ec; color: #2f6f4f; }
.badge.bleu { background: #eaf3ff; color: #1d5fbf; }
.badge.gris { background: #f0ece0; color: #5a4a30; }
label { display: flex; flex-direction: column; gap: 5px; font-size: 0.85rem; font-weight: 600; color: #3a4a5a; }
.row-check { flex-direction: row; align-items: center; gap: 8px; font-weight: 500; }
.inp { padding: 8px 10px; border: 1px solid #d0cbb8; border-radius: 6px; font-size: 0.875rem; background: white; width: 100%; box-sizing: border-box; }
.inp:focus { outline: none; border-color: #2f6f4f; box-shadow: 0 0 0 2px rgba(47,111,79,0.2); }
</style>
