<template>
  <div class="page">
    <div class="page-header">
      <h1>Référentiels</h1>
      <div class="tabs">
        <button :class="['tab', { active: onglet === 'produits' }]" @click="onglet = 'produits'; chargerProduits()">Produits ({{ produits.length }})</button>
        <button :class="['tab', { active: onglet === 'tarifs' }]" @click="onglet = 'tarifs'; chargerTarifs()">Tarifs clients</button>
        <button :class="['tab', { active: onglet === 'interne' }]" @click="onglet = 'interne'; chargerInterne()">Catalogue interne</button>
      </div>
    </div>

    <!-- PRODUITS -->
    <div v-if="onglet === 'produits'">
      <div class="toolbar">
        <input v-model="rechercheProduit" placeholder="Rechercher un produit…" class="search" />
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Gencod</th><th>Désignation</th><th>Unité</th><th>DLUO (j)</th><th>Actif</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="p in produitsFiltres" :key="p.id">
              <td class="mono">{{ p.gencod }}</td>
              <td>
                <span v-if="editId !== p.id">{{ p.designation }}</span>
                <input v-else v-model="editData.designation" class="edit-input" />
              </td>
              <td>
                <span v-if="editId !== p.id">{{ p.unite }}</span>
                <input v-else v-model="editData.unite" class="edit-input small" />
              </td>
              <td>
                <span v-if="editId !== p.id">{{ p.dluo_jours ?? '—' }}</span>
                <input v-else v-model.number="editData.dluo_jours" type="number" class="edit-input small" />
              </td>
              <td>
                <span class="badge-actif" :class="{ actif: p.actif, inactif: !p.actif }">
                  {{ p.actif ? 'Actif' : 'Inactif' }}
                </span>
              </td>
              <td class="actions">
                <template v-if="editId !== p.id">
                  <button class="btn-icon" @click="editer(p)">✏️</button>
                  <button class="btn-icon danger" @click="confirm = { type: 'produit', item: p }">✕</button>
                </template>
                <template v-else>
                  <button class="btn-icon ok" @click="sauvegarderProduit(p)">✓</button>
                  <button class="btn-icon" @click="editId = null">✕</button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- TARIFS -->
    <div v-if="onglet === 'tarifs'">
      <div class="toolbar">
        <select v-model="filtreClient" @change="chargerTarifs" class="search">
          <option value="">Tous les clients</option>
          <option v-for="c in clients" :key="c.id" :value="c.id">{{ c.nom }}</option>
        </select>
        <input v-model="rechercheTarif" placeholder="Rechercher un produit…" class="search" />
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Client</th><th>Désignation</th><th>Gencod</th><th>PCB</th><th>Tarif général</th><th>Remise %</th><th>Tarif net</th><th>Unité</th></tr>
          </thead>
          <tbody>
            <tr v-for="t in tarifsFiltres" :key="t.id">
              <td>{{ t.client_nom }}</td>
              <td>{{ t.designation }}</td>
              <td class="mono">{{ t.gencod }}</td>
              <td class="num">{{ t.pcb ?? '—' }}</td>
              <td class="num">{{ t.tarif_general ? Number(t.tarif_general).toFixed(2) + ' €' : '—' }}</td>
              <td class="num">{{ t.remise_pct ? Number(t.remise_pct).toFixed(2) + ' %' : '—' }}</td>
              <td class="num prix">{{ t.tarif_net ? Number(t.tarif_net).toFixed(2) + ' €' : '—' }}</td>
              <td>{{ t.unite_facturation ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- CATALOGUE INTERNE -->
    <div v-if="onglet === 'interne'">
      <div class="toolbar">
        <select v-model="filtreFamille" class="search">
          <option value="">Toutes les familles</option>
          <option v-for="f in familles" :key="f.code" :value="f.code">{{ f.code }} — {{ f.libelle }}</option>
        </select>
        <input v-model="rechercheInterne" placeholder="Rechercher un code ou libellé…" class="search" />
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Code interne</th><th>Libellé</th><th>Famille</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in interneFiltre" :key="r.code_interne">
              <td class="mono">{{ r.code_interne }}</td>
              <td>{{ r.libelle_produit }}</td>
              <td><span class="badge-famille">{{ r.famille_code }} — {{ r.famille_libelle }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Confirm suppression -->
    <div v-if="confirm" class="confirm-overlay" @click.self="confirm = null">
      <div class="confirm-box">
        <p>Supprimer <strong>{{ confirm.item.designation || confirm.item.gencod }}</strong> ?</p>
        <div class="confirm-actions">
          <button class="btn secondary" @click="confirm = null">Annuler</button>
          <button class="btn danger" @click="confirmerSuppression">Supprimer</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from '../services/api';

const onglet = ref('produits');
const produits = ref([]);
const tarifs = ref([]);
const interne = ref([]);
const familles = ref([]);
const clients = ref([]);

const rechercheProduit = ref('');
const rechercheTarif = ref('');
const rechercheInterne = ref('');
const filtreClient = ref('');
const filtreFamille = ref('');

const editId = ref(null);
const editData = ref({});
const confirm = ref(null);

const produitsFiltres = computed(() => {
  const q = rechercheProduit.value.toLowerCase();
  return produits.value.filter(p =>
    p.designation.toLowerCase().includes(q) || p.gencod.includes(q)
  );
});

const tarifsFiltres = computed(() => {
  const q = rechercheTarif.value.toLowerCase();
  return tarifs.value.filter(t =>
    (!q || t.designation.toLowerCase().includes(q) || t.gencod.includes(q))
  );
});

const interneFiltre = computed(() => {
  const q = rechercheInterne.value.toLowerCase();
  return interne.value.filter(r =>
    (!filtreFamille.value || r.famille_code == filtreFamille.value) &&
    (!q || r.code_interne.toLowerCase().includes(q) || r.libelle_produit.toLowerCase().includes(q))
  );
});

async function chargerProduits() {
  produits.value = await api.get('/referentiels/produits');
}

async function chargerTarifs() {
  const params = filtreClient.value ? '?client_id=' + filtreClient.value : '';
  tarifs.value = await api.get('/referentiels/tarifs' + params);
  if (!clients.value.length) clients.value = await api.get('/referentiels/clients');
}

async function chargerInterne() {
  const data = await api.get('/referentiels/interne');
  interne.value = data.produits || [];
  familles.value = data.familles || [];
}

function editer(p) {
  editId.value = p.id;
  editData.value = { designation: p.designation, unite: p.unite, dluo_jours: p.dluo_jours };
}

async function sauvegarderProduit(p) {
  await api.patch('/referentiels/produits/' + p.id, editData.value);
  Object.assign(p, editData.value);
  editId.value = null;
}

async function confirmerSuppression() {
  const { type, item } = confirm.value;
  if (type === 'produit') {
    await api.delete('/referentiels/produits/' + item.id);
    produits.value = produits.value.filter(p => p.id !== item.id);
  }
  confirm.value = null;
}

onMounted(chargerProduits);
</script>

<style scoped>
.page { max-width: 1100px; margin: 0 auto; padding: 24px 16px; }
.page-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
h1 { margin: 0; font-size: 1.4rem; color: #1a2a4a; }
.tabs { display: flex; gap: 4px; background: #f0ece0; border-radius: 8px; padding: 4px; }
.tab { border: none; background: transparent; padding: 7px 16px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; color: #5a6070; font-weight: 500; }
.tab.active { background: white; color: #1a2a4a; font-weight: 700; box-shadow: 0 1px 4px rgba(0,0,0,0.12); }
.toolbar { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.search { padding: 8px 12px; border: 1px solid #d0cbb8; border-radius: 6px; font-size: 0.85rem; background: white; min-width: 200px; }
.table-wrap { background: white; border-radius: 10px; box-shadow: 0 1px 6px rgba(0,0,0,0.10); overflow: auto; }
table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
thead { background: #f5f2e8; }
th { padding: 10px 14px; text-align: left; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: #5a6070; font-weight: 600; border-bottom: 2px solid #e8e3d5; white-space: nowrap; }
td { padding: 9px 14px; border-bottom: 1px solid #f0ece0; vertical-align: middle; }
tr:last-child td { border-bottom: none; }
tr:hover { background: #faf8f2; }
.mono { font-family: monospace; font-size: 0.82rem; color: #4a7a5a; }
.num { font-variant-numeric: tabular-nums; text-align: right; }
.prix { font-weight: 700; color: #1a2a4a; }
.edit-input { border: 1px solid #2f6f4f; border-radius: 4px; padding: 4px 8px; font-size: 0.875rem; width: 100%; }
.edit-input.small { width: 70px; }
.actions { display: flex; gap: 4px; }
.btn-icon { border: none; background: transparent; cursor: pointer; font-size: 0.9rem; padding: 4px 8px; border-radius: 4px; }
.btn-icon:hover { background: #f0ece0; }
.btn-icon.danger:hover { background: #fde8e8; color: #b3261e; }
.btn-icon.ok { color: #2f6f4f; font-weight: 700; }
.badge-actif { font-size: 0.72rem; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
.badge-actif.actif { background: #eef6ec; color: #2f6f4f; }
.badge-actif.inactif { background: #f0ece0; color: #7a6050; }
.badge-famille { font-size: 0.78rem; background: #f0ece0; color: #5a4a30; padding: 2px 8px; border-radius: 10px; }
.confirm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 200; display: flex; align-items: center; justify-content: center; }
.confirm-box { background: white; border-radius: 10px; padding: 24px; max-width: 400px; width: 90%; }
.confirm-box p { margin: 0 0 20px; line-height: 1.5; }
.confirm-actions { display: flex; gap: 10px; justify-content: flex-end; }
.btn { padding: 8px 18px; border-radius: 6px; border: none; font-size: 0.88rem; cursor: pointer; font-weight: 600; }
.btn.secondary { background: #f0ece0; color: #1a2a4a; }
.btn.danger { background: #b3261e; color: white; }
</style>
