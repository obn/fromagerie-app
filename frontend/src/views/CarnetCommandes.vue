<template>
  <div class="wrap">
    <h1>Carnet de commandes — {{ date }}</h1>
    <p v-if="chargement">Chargement…</p>
    <p v-else-if="erreur" class="erreur">{{ erreur }}</p>
    <p v-else-if="commandes.length === 0">Aucune commande à livrer ce jour.</p>
    <div v-for="commande in commandes" :key="commande.id" class="client-block">
      <h2>{{ commande.client_nom }} — N° {{ commande.numero_commande }}</h2>
      <ul>
        <li v-for="ligne in commande.lignes" :key="ligne.id">
          {{ ligne.quantite }} — {{ ligne.designation_brute }}
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
</style>
