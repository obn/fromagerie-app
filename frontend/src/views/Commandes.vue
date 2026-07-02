<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>Commandes</h1>
        <p class="subtitle">Historique par date de livraison</p>
      </div>
      <div class="filters">
        <select v-model="filtreAnnee" @change="charger">
          <option value="">Toutes années</option>
          <option v-for="a in annees" :key="a" :value="a">{{ a }}</option>
        </select>
        <select v-model="filtreMois" @change="charger">
          <option value="">Tous mois</option>
          <option v-for="m in mois" :key="m.val" :value="m.val">{{ m.label }}</option>
        </select>
      </div>
    </div>

    <div v-if="chargement" class="etat">Chargement…</div>
    <div v-else-if="erreur" class="etat erreur">{{ erreur }}</div>
    <div v-else-if="commandes.length === 0" class="etat vide">Aucune commande pour cette période.</div>

    <div v-else class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>N° commande</th>
            <th>Client</th>
            <th>Commande le</th>
            <th>Livraison</th>
            <th>Statut</th>
            <th>Source</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in commandes" :key="c.id" :class="['row', 'statut-' + c.statut]">
            <td><span class="num">{{ c.numero_commande }}</span></td>
            <td>{{ c.client_nom }}</td>
            <td>{{ formatDate(c.date_commande) }}</td>
            <td><strong>{{ formatDate(c.date_livraison) }}</strong></td>
            <td>
              <select class="statut-select" :value="c.statut" @change="changerStatut(c, $event.target.value)">
                <option value="brouillon">Brouillon</option>
                <option value="a_verifier">À vérifier</option>
                <option value="validee">Validée</option>
                <option value="archivee">Archivée</option>
              </select>
            </td>
            <td><span class="badge-source" :class="c.source">{{ c.source }}</span></td>
            <td class="actions">
              <button class="btn-icon" title="Voir les lignes" @click="voirLignes(c)">👁</button>
              <button class="btn-icon danger" title="Supprimer" @click="supprimer(c)">✕</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Panneau latéral : lignes de commande -->
    <div v-if="commandeOuverte" class="panel-overlay" @click.self="commandeOuverte = null">
      <div class="panel">
        <div class="panel-header">
          <h2>{{ commandeOuverte.client_nom }} — N° {{ commandeOuverte.numero_commande }}</h2>
          <button class="btn-icon" @click="commandeOuverte = null">✕</button>
        </div>
        <div v-if="lignesChargement" class="etat">Chargement…</div>
        <table v-else class="table-lignes">
          <thead>
            <tr><th>Qté</th><th>Désignation</th><th>Réf.</th><th>Prix</th><th>Certitude</th></tr>
          </thead>
          <tbody>
            <tr v-for="l in lignes" :key="l.id" :class="'cert-' + l.certitude">
              <td>{{ l.quantite }}</td>
              <td>{{ l.designation_brute }}</td>
              <td class="mono">{{ l.gencod || '—' }}</td>
              <td>{{ l.tarif_net ? Number(l.tarif_net).toFixed(2) + ' €' : '—' }}</td>
              <td><span class="badge-cert" :class="l.certitude">{{ l.certitude }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="confirm" class="confirm-overlay" @click.self="confirm = null">
      <div class="confirm-box">
        <p>Supprimer la commande <strong>{{ confirm.numero_commande }}</strong> ({{ confirm.client_nom }}) ?</p>
        <div class="confirm-actions">
          <button class="btn secondary" @click="confirm = null">Annuler</button>
          <button class="btn danger" @click="confirmerSuppression">Supprimer</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../services/api';

const commandes = ref([]);
const chargement = ref(true);
const erreur = ref(null);
const filtreAnnee = ref('');
const filtreMois = ref('');
const commandeOuverte = ref(null);
const lignes = ref([]);
const lignesChargement = ref(false);
const confirm = ref(null);

const annees = [2024, 2025, 2026, 2027];
const mois = [
  { val: '01', label: 'Janvier' }, { val: '02', label: 'Février' },
  { val: '03', label: 'Mars' }, { val: '04', label: 'Avril' },
  { val: '05', label: 'Mai' }, { val: '06', label: 'Juin' },
  { val: '07', label: 'Juillet' }, { val: '08', label: 'Août' },
  { val: '09', label: 'Septembre' }, { val: '10', label: 'Octobre' },
  { val: '11', label: 'Novembre' }, { val: '12', label: 'Décembre' },
];

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR');
}

async function charger() {
  chargement.value = true;
  erreur.value = null;
  try {
    const params = new URLSearchParams();
    if (filtreAnnee.value) params.set('annee', filtreAnnee.value);
    if (filtreMois.value) params.set('mois', filtreMois.value);
    commandes.value = await api.get('/commandes?' + params.toString());
  } catch (e) {
    erreur.value = e.message;
  } finally {
    chargement.value = false;
  }
}

async function voirLignes(c) {
  commandeOuverte.value = c;
  lignesChargement.value = true;
  try {
    const data = await api.get('/commandes/' + c.id);
    lignes.value = data.lignes || [];
  } catch (e) {
    lignes.value = [];
  } finally {
    lignesChargement.value = false;
  }
}

async function changerStatut(c, statut) {
  try {
    await api.patch('/commandes/' + c.id, { statut });
    c.statut = statut;
  } catch (e) {
    alert('Erreur : ' + e.message);
  }
}

function supprimer(c) { confirm.value = c; }

async function confirmerSuppression() {
  try {
    await api.delete('/commandes/' + confirm.value.id);
    commandes.value = commandes.value.filter(c => c.id !== confirm.value.id);
    confirm.value = null;
  } catch (e) {
    alert('Erreur : ' + e.message);
  }
}

onMounted(charger);
</script>

<style scoped>
.page { max-width: 1100px; margin: 0 auto; padding: 24px 16px; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
h1 { margin: 0; font-size: 1.4rem; color: #1a2a4a; }
.subtitle { margin: 2px 0 0; color: #7a8898; font-size: 0.85rem; }
.filters { display: flex; gap: 8px; }
select { padding: 7px 10px; border: 1px solid #d0cbb8; border-radius: 6px; font-size: 0.85rem; background: white; }

.etat { padding: 40px; text-align: center; color: #7a8898; }
.erreur { color: #b3261e; }
.vide { font-style: italic; }

.table-wrap { background: white; border-radius: 10px; box-shadow: 0 1px 6px rgba(0,0,0,0.10); overflow: hidden; }
table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
thead { background: #f5f2e8; }
th { padding: 10px 14px; text-align: left; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #5a6070; font-weight: 600; border-bottom: 2px solid #e8e3d5; }
td { padding: 10px 14px; border-bottom: 1px solid #f0ece0; vertical-align: middle; }
tr:last-child td { border-bottom: none; }
tr.row:hover { background: #faf8f2; }

.num { font-family: monospace; font-size: 0.92rem; background: #f0ece0; padding: 2px 6px; border-radius: 4px; }
.mono { font-family: monospace; font-size: 0.82rem; color: #4a7a5a; }

.statut-select { border: none; background: transparent; font-size: 0.82rem; cursor: pointer; color: #1a2a4a; padding: 3px 4px; border-radius: 4px; }
.statut-select:hover { background: #f0ece0; }

.badge-source { font-size: 0.72rem; padding: 2px 8px; border-radius: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
.badge-source.gmail { background: #e8f0fe; color: #1a56b0; }
.badge-source.manuel { background: #f0ece0; color: #5a4a30; }

.actions { display: flex; gap: 6px; }
.btn-icon { border: none; background: transparent; cursor: pointer; font-size: 0.9rem; padding: 4px 8px; border-radius: 4px; color: #5a6070; }
.btn-icon:hover { background: #f0ece0; }
.btn-icon.danger:hover { background: #fde8e8; color: #b3261e; }

/* panel lignes */
.panel-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.35); z-index: 100; display: flex; justify-content: flex-end; }
.panel { width: 580px; max-width: 95vw; background: white; height: 100%; overflow-y: auto; box-shadow: -4px 0 20px rgba(0,0,0,0.15); }
.panel-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #e8e3d5; position: sticky; top: 0; background: white; }
.panel-header h2 { margin: 0; font-size: 1rem; color: #1a2a4a; }
.table-lignes { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.table-lignes th { padding: 8px 14px; text-align: left; font-size: 0.72rem; text-transform: uppercase; color: #7a8898; border-bottom: 2px solid #e8e3d5; }
.table-lignes td { padding: 9px 14px; border-bottom: 1px solid #f0ece0; }
.badge-cert { font-size: 0.72rem; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
.badge-cert.haute { background: #eef6ec; color: #2f6f4f; }
.badge-cert.a_verifier { background: #fff3a0; color: #7a6000; }
.badge-cert.non_fiable { background: #fde8e8; color: #b3261e; }

/* confirm */
.confirm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 200; display: flex; align-items: center; justify-content: center; }
.confirm-box { background: white; border-radius: 10px; padding: 24px; max-width: 400px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.2); }
.confirm-box p { margin: 0 0 20px; line-height: 1.5; }
.confirm-actions { display: flex; gap: 10px; justify-content: flex-end; }
.btn { padding: 8px 18px; border-radius: 6px; border: none; font-size: 0.88rem; cursor: pointer; font-weight: 600; }
.btn.secondary { background: #f0ece0; color: #1a2a4a; }
.btn.danger { background: #b3261e; color: white; }
</style>
