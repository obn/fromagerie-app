<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>Paramètres</h1>
        <p class="subtitle">Configuration de l'application</p>
      </div>
      <button class="btn primary" @click="ajouterParam">+ Ajouter</button>
    </div>

    <!-- Carte de synchronisation Gmail manuelle -->
    <div class="gmail-card">
      <div class="gmail-card-head">
        <div>
          <h2>Synchronisation Gmail</h2>
          <p class="gmail-sub">Récupère les commandes PDF depuis les mails du label configuré</p>
        </div>
        <button class="btn primary" :disabled="syncEnCours" @click="lancerSync">
          {{ syncEnCours ? 'Synchronisation…' : '🔄 Synchroniser maintenant' }}
        </button>
      </div>

      <div v-if="syncRapport" class="gmail-rapport" :class="{ erreur: syncRapport.erreur }">
        <template v-if="syncRapport.erreur">
          ❌ Erreur : {{ syncRapport.erreur }}
        </template>
        <template v-else>
          ✓ {{ syncRapport.nbMessages }} mail(s) trouvé(s) —
          {{ syncRapport.nbInseres }} commande(s) insérée(s),
          {{ syncRapport.nbDoublons }} doublon(s),
          {{ syncRapport.nbErreurs }} erreur(s)
          <span class="gmail-date">({{ formatHeure(syncRapport.date) }})</span>
        </template>
      </div>
    </div>

    <!-- Carte de deplacement des mails traites vers le label historique -->
    <div class="gmail-card">
      <div class="gmail-card-head">
        <div>
          <h2>Déplacer les mails historiques</h2>
          <p class="gmail-sub">Importer dans le SI les mails avant automatisation de la saisie des commandes</p>
        </div>
      </div>

      <div class="deplacement-filtres">
        <input v-model="deplacement.objet" placeholder="Objet contient…" class="inp-inline" />
        <select v-model="deplacement.annee" class="inp-inline">
          <option value="">Toutes années</option>
          <option v-for="a in anneesDisponibles" :key="a" :value="a">{{ a }}</option>
        </select>
        <select v-model="deplacement.mois" class="inp-inline" :disabled="!deplacement.annee">
          <option value="">Tous mois</option>
          <option v-for="m in moisDisponibles" :key="m.v" :value="m.v">{{ m.l }}</option>
        </select>
        <select v-model="deplacement.jour" class="inp-inline" :disabled="!deplacement.mois">
          <option value="">Tous jours</option>
          <option v-for="j in 31" :key="j" :value="j">{{ j }}</option>
        </select>
      </div>

      <div class="deplacement-actions">
        <label class="check-inline">
          <input type="checkbox" v-model="deplacement.dryRun" />
          Aperçu seulement (ne rien modifier)
        </label>
        <button class="btn secondary" :disabled="deplacementEnCours" @click="lancerDeplacement">
          {{ deplacementEnCours ? 'Traitement…' : (deplacement.dryRun ? '👁 Aperçu' : '📤 Déplacer') }}
        </button>
      </div>

      <div v-if="deplacementRapport" class="gmail-rapport" :class="{ erreur: deplacementRapport.error }">
        <template v-if="deplacementRapport.error">
          ❌ Erreur : {{ deplacementRapport.error }}
        </template>
        <template v-else>
          ✓ {{ deplacementRapport.nbTrouves }} mail(s) trouvé(s) —
          {{ deplacementRapport.nbDeplaces }} déplacé(s) vers "{{ deplacementRapport.labelDestination }}",
          {{ deplacementRapport.nbIgnores }} ignoré(s)
          <span v-if="deplacementRapport.dryRun" class="gmail-date">(aperçu — rien n'a été modifié)</span>
        </template>
        <ul v-if="deplacementRapport.details?.length" class="deplacement-details">
          <li v-for="(d, i) in deplacementRapport.details" :key="i" :class="d.action">
            {{ d.action === 'deplace' ? '→' : '=' }} {{ d.sujet }}
          </li>
        </ul>
      </div>
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
import { ref, reactive, onMounted } from 'vue';
import { api } from '../services/api';

const parametres = ref([]);
const chargement = ref(true);
const editId = ref(null);
const editData = ref({});
const confirm = ref(null);
const ajout = ref(null);
const syncEnCours = ref(false);
const syncRapport = ref(null);

const anneeActuelle = new Date().getFullYear();
const anneesDisponibles = [anneeActuelle - 1, anneeActuelle, anneeActuelle + 1];
const moisDisponibles = [
  { v: 1, l: 'Janvier' }, { v: 2, l: 'Février' }, { v: 3, l: 'Mars' },
  { v: 4, l: 'Avril' }, { v: 5, l: 'Mai' }, { v: 6, l: 'Juin' },
  { v: 7, l: 'Juillet' }, { v: 8, l: 'Août' }, { v: 9, l: 'Septembre' },
  { v: 10, l: 'Octobre' }, { v: 11, l: 'Novembre' }, { v: 12, l: 'Décembre' },
];

const deplacement = reactive({ objet: 'COMMANDE FROMAGERIE', annee: '', mois: '', jour: '', dryRun: true });
const deplacementEnCours = ref(false);
const deplacementRapport = ref(null);

function formatHeure(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

async function lancerSync() {
  syncEnCours.value = true;
  syncRapport.value = null;
  try {
    await api.post('/gmail/sync?mode=test', {});
    // La sync tourne en arriere-plan cote serveur : on interroge le statut
    // toutes les 1.5s jusqu'a ce qu'elle soit terminee.
    await new Promise(resolve => {
      const interval = setInterval(async () => {
        try {
          const statut = await api.get('/gmail/statut');
          if (!statut.en_cours) {
            clearInterval(interval);
            syncRapport.value = statut.dernier_rapport;
            resolve();
          }
        } catch (e) {
          clearInterval(interval);
          syncRapport.value = { erreur: e.message };
          resolve();
        }
      }, 1500);
    });
  } catch (e) {
    syncRapport.value = { erreur: e.message };
  } finally {
    syncEnCours.value = false;
  }
}

async function lancerDeplacement() {
  deplacementEnCours.value = true;
  deplacementRapport.value = null;
  try {
    deplacementRapport.value = await api.post('/gmail/deplacer-historique', {
      objet: deplacement.objet || undefined,
      annee: deplacement.annee || undefined,
      mois: deplacement.mois || undefined,
      jour: deplacement.jour || undefined,
      mode: 'test',
      dryRun: deplacement.dryRun,
    });
  } catch (e) {
    deplacementRapport.value = { error: e.message };
  } finally {
    deplacementEnCours.value = false;
  }
}

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

.gmail-card { background: white; border-radius: 10px; box-shadow: 0 1px 6px rgba(0,0,0,0.10); padding: 18px 20px; margin-bottom: 20px; }
.gmail-card-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.gmail-card h2 { margin: 0; font-size: 1rem; color: #1a2a4a; }
.gmail-sub { margin: 3px 0 0; font-size: 0.82rem; color: #7a8898; }
.gmail-rapport { margin-top: 14px; padding: 10px 12px; border-radius: 6px; background: #eef6ec; color: #2f6f4f; font-size: 0.85rem; }
.gmail-rapport.erreur { background: #fde8e8; color: #b3261e; }
.gmail-date { color: #7a8898; font-size: 0.78rem; margin-left: 6px; }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.btn.secondary { background: #f0ece0; color: #1a2a4a; }
.btn.secondary:hover:not(:disabled) { background: #e5dfd0; }

.deplacement-filtres { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.inp-inline { padding: 7px 10px; border: 1px solid #d0cbb8; border-radius: 6px; font-size: 0.85rem; background: white; }
.inp-inline:disabled { background: #f5f2e8; color: #a89b7a; }

.deplacement-actions { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; flex-wrap: wrap; gap: 10px; }
.check-inline { display: flex; align-items: center; gap: 6px; font-size: 0.85rem; color: #5a6070; cursor: pointer; }

.deplacement-details { list-style: none; margin: 10px 0 0; padding: 0; max-height: 200px; overflow-y: auto; border-top: 1px solid rgba(0,0,0,0.08); }
.deplacement-details li { padding: 4px 0; font-size: 0.8rem; }
.deplacement-details li.deplace { color: #2f6f4f; }
.deplacement-details li.ignore { color: #9a9488; }
.table-wrap { background: white; border-radius: 10px; box-shadow: 0 1px 6px rgba(0,0,0,0.10); overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; }
table { width: 100%; min-width: 640px; border-collapse: collapse; font-size: 0.875rem; }
thead { background: #f5f2e8; }
th { padding: 10px 14px; text-align: left; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: #5a6070; font-weight: 600; border-bottom: 2px solid #e8e3d5; }
td { padding: 10px 14px; border-bottom: 1px solid #f0ece0; vertical-align: middle; }
td:nth-child(2), td:nth-child(3) { min-width: 220px; }
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