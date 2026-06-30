<template>
  <div class="wrap">
    <h1>Carnet de commandes — {{ date }}</h1>
    <p v-if="chargement">Chargement…</p>
    <p v-else-if="erreur" class="erreur">{{ erreur }}</p>
    <p v-else-if="commandes.length === 0">Aucune commande à livrer ce jour.</p>
    <div v-for="commande in commandes" :key="commande.id" class="client-block">
      <h2>{{ commande.client_nom }} — N° {{ commande.numero_commande }}</h2>
      <ul>
        <li v-for="ligne in commande.lignes" :key="ligne.id" class="ligne">
          <span class="qty">{{ ligne.quantite }}</span>
          <span class="designation">{{ ligne.designation_brute }}</span>
          <span v-if="ligne.gencod" class="ref">réf. {{ ligne.gencod }}</span>
          <span v-else class="ref ref-manquante">réf. non résolue</span>
          <span v-if="ligne.tarif_net" class="prix">{{ Number(ligne.tarif_net).toFixed(2) }} € / {{ ligne.unite_tarif }}</span>
          <span v-else class="prix prix-manquant">prix inconnu</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../services/api';

// TODO : remplacer par la date du jour reelle / un selecteur de date.
// Pour l'instant on reprend la date de l'exemple deja en base de test.
const date = ref('2026-06-18');
const commandes = ref([]);
const chargement = ref(true);
const erreur = ref(null);

onMounted(async () => {
  try {
    const [annee, mois, jour] = date.value.split('-');
    commandes.value = await api.get(`/carnet/${annee}/${mois}/${jour}`);
  } catch (e) {
    erreur.value = "Impossible de charger le carnet : " + e.message;
  } finally {
    chargement.value = false;
  }
});
</script>

<style scoped>
.wrap { max-width: 900px; margin: 0 auto; padding: 14px; }
.client-block { background: #fbf9f3; border-radius: 10px; margin-bottom: 16px; padding: 10px 14px; }
.erreur { color: #b3261e; }
.ligne { display: flex; align-items: baseline; gap: 10px; padding: 6px 0; border-bottom: 1px solid #eee; flex-wrap: wrap; }
.ligne .qty { font-weight: 700; min-width: 2.5em; }
.ligne .designation { flex: 1; min-width: 180px; }
.ligne .ref { font-size: 0.82rem; color: #4a7a5a; }
.ligne .ref-manquante { color: #b3261e; }
.ligne .prix { font-size: 0.85rem; color: #1a2a4a; font-weight: 600; }
.ligne .prix-manquant { color: #b3261e; font-weight: 400; }
</style>
