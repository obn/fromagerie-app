<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>Paramètres</h1>
        <p class="subtitle">Configuration de l'application</p>
      </div>
      <button class="btn primary" @click="ajouterParam">+ Ajouter</button>
    </div>

    <div v-if="chargement" class="etat">Chargement…</div>
    <div v-else class="table-wrap">
      <table>
        <thead>
          <tr><th>Clé</th><th>Valeur</th><th>Description</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="p in parametres" :key="p.id">
            <td class="mono">{{ p.cle }}</td>
            <td>
              <span v-if="editId !== p.id">{{ p.valeur }}</span>
              <input v-else v-model="editData.valeur" class="edit-input" />
            </td>
            <td class="muted">
              <span v-if="editId !== p.id">{{ p.description }}</span>
              <input v-else v-model="editData.description" class="edit-input" />
            </td>
            <td class="actions">
              <template v-if="editId !== p.id">
                <button class="btn-icon" @click="editer(p)">✏️</button>
                <button class="btn-icon danger" @click="confirm = p">✕</button>
              </template>
              <template v-else>
                <button class="btn-icon ok" @click="sauvegarder(p)">✓</button>
                <button class="btn-icon" @click="editId = null">✕</button>
              </template>
            </td>
          </tr>
          <!-- Ligne d'ajout -->
          <tr v-if="ajout">
            <td><input v-model="ajout.cle" class="edit-input" placeholder="cle_parametre" /></td>
            <td><input v-model="ajout.valeur" class="edit-input" placeholder="valeur" /></td>
            <td><input v-model="ajout.description" class="edit-input" placeholder="Description…" /></td>
            <td class="actions">
              <button class="btn-icon ok" @click="creerParam">✓</button>
              <button class="btn-icon" @click="ajout = null">✕</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="confirm" class="confirm-overlay" @click.self="confirm = null">
      <div class="confirm-box">
        <p>Supprimer le paramètre <strong>{{ confirm.cle }}</strong> ?</p>
        <div class="confirm-actions">
          <button class="btn secondary" @click="confirm = null">Annuler</button>
          <button class="btn danger" @click="supprimerParam">Supprimer</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../services/api';

const parametres = ref([]);
const chargement = ref(true);
const editId = ref(null);
const editData = ref({});
const confirm = ref(null);
const ajout = ref(null);

async function charger() {
  chargement.value = true;
  parametres.value = await api.get('/parametres');
  chargement.value = false;
}

function editer(p) {
  editId.value = p.id;
  editData.value = { valeur: p.valeur, description: p.description };
}

async function sauvegarder(p) {
  await api.patch('/parametres/' + p.id, editData.value);
  Object.assign(p, editData.value);
  editId.value = null;
}

function ajouterParam() {
  ajout.value = { cle: '', valeur: '', description: '' };
}

async function creerParam() {
  const nouveau = await api.post('/parametres', ajout.value);
  parametres.value.push(nouveau);
  ajout.value = null;
  await charger();
}

async function supprimerParam() {
  await api.delete('/parametres/' + confirm.value.id);
  parametres.value = parametres.value.filter(p => p.id !== confirm.value.id);
  confirm.value = null;
}

onMounted(charger);
</script>

<style scoped>
.page { max-width: 900px; margin: 0 auto; padding: 24px 16px; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; }
h1 { margin: 0; font-size: 1.4rem; color: #1a2a4a; }
.subtitle { margin: 2px 0 0; color: #7a8898; font-size: 0.85rem; }
.etat { padding: 40px; text-align: center; color: #7a8898; }
.table-wrap { background: white; border-radius: 10px; box-shadow: 0 1px 6px rgba(0,0,0,0.10); overflow: hidden; }
table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
thead { background: #f5f2e8; }
th { padding: 10px 14px; text-align: left; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: #5a6070; font-weight: 600; border-bottom: 2px solid #e8e3d5; }
td { padding: 10px 14px; border-bottom: 1px solid #f0ece0; vertical-align: middle; }
tr:last-child td { border-bottom: none; }
tr:hover { background: #faf8f2; }
.mono { font-family: monospace; font-size: 0.88rem; color: #2f6f4f; font-weight: 600; }
.muted { color: #7a8898; font-size: 0.85rem; }
.edit-input { border: 1px solid #2f6f4f; border-radius: 4px; padding: 5px 8px; font-size: 0.875rem; width: 100%; box-sizing: border-box; }
.actions { display: flex; gap: 4px; white-space: nowrap; }
.btn-icon { border: none; background: transparent; cursor: pointer; font-size: 0.9rem; padding: 4px 8px; border-radius: 4px; }
.btn-icon:hover { background: #f0ece0; }
.btn-icon.danger:hover { background: #fde8e8; color: #b3261e; }
.btn-icon.ok { color: #2f6f4f; font-weight: 700; }
.btn { padding: 8px 18px; border-radius: 6px; border: none; font-size: 0.88rem; cursor: pointer; font-weight: 600; }
.btn.primary { background: #2f6f4f; color: white; }
.btn.secondary { background: #f0ece0; color: #1a2a4a; }
.btn.danger { background: #b3261e; color: white; }
.confirm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 200; display: flex; align-items: center; justify-content: center; }
.confirm-box { background: white; border-radius: 10px; padding: 24px; max-width: 400px; width: 90%; }
.confirm-box p { margin: 0 0 20px; }
.confirm-actions { display: flex; gap: 10px; justify-content: flex-end; }
</style>
