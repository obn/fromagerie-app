<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>Livraisons</h1>
        <p class="sub">Par jour de la semaine</p>
      </div>

      <div class="toolbar week-toolbar">
        <button class="btn-nav" @click="semainePrecedente" aria-label="Semaine précédente">◀</button>
        <button class="btn btn-current" :disabled="estSemaineCourante" @click="retourVersSemaineCourante" aria-label="Semaine courante">Aujourd'hui</button>
        <span class="week-range">{{ libellePeriode }}</span>
        <button class="btn-nav" @click="semaineSuivante" aria-label="Semaine suivante">▶</button>
      </div>
    </div>

    <div v-if="chargement" class="etat">Chargement…</div>

    <div v-else class="week-grid">
      <div v-for="jour in jours" :key="jour.dateKey" :class="['day-card', { 'day-card-today': estJourActuel(jour.dateKey) }]">
        <div class="day-header">
          <h2>{{ jour.nom }}</h2>
          <span>{{ jour.dateLabel }}</span>
        </div>

        <ul v-if="jour.commandes.length" class="delivery-list">
          <li v-for="commande in jour.commandes" :key="commande.id" class="delivery-item">
            <div class="delivery-main">
              <strong>{{ commande.client_nom }}</strong>
              <span class="delivery-number">{{ commande.numero_commande }}</span>
            </div>
            <span :class="['badge-statut', statutClasse(commande.statut)]">{{ libelleStatut(commande.statut) }}</span>
          </li>
        </ul>

        <p v-else class="empty">Aucune livraison</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '../services/api';

const aujourdHui = new Date();
const semaineSelectionnee = ref(lundiDeLaSemaine(aujourdHui));
const chargement = ref(true);
const donnees = ref({ debutSemaine: '', finSemaine: '', commandes: [] });

const estSemaineCourante = computed(() => {
  const semaineActuelle = lundiDeLaSemaine(aujourdHui);
  return formatDateISO(semaineSelectionnee.value) === formatDateISO(semaineActuelle);
});

function formatDateISO(date) {
  const d = new Date(date);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

function lundiDeLaSemaine(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function normaliserDate(date) {
  if (!date) return null;
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : d;
}

function estJourActuel(dateKey) {
  return dateKey === formatDateISO(aujourdHui);
}

function capitaliser(texte) {
  return texte ? texte.charAt(0).toUpperCase() + texte.slice(1) : '';
}

const libellePeriode = computed(() => {
  if (!donnees.value.debutSemaine || !donnees.value.finSemaine) return '';

  const debut = new Date(donnees.value.debutSemaine + 'T00:00:00');
  const fin = new Date(donnees.value.finSemaine + 'T00:00:00');

  const formatDebut = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const formatCourt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });

  const memeMois = debut.getMonth() === fin.getMonth() && debut.getFullYear() === fin.getFullYear();

  if (memeMois) {
    return `${debut.getDate()} - ${fin.getDate()} ${new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(fin)}`;
  }

  return `${formatCourt.format(debut)} - ${formatDebut.format(fin)}`;
});

const jours = computed(() => {
  const debut = new Date(semaineSelectionnee.value);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(debut);
    date.setDate(debut.getDate() + index);

    const dateKey = formatDateISO(date);
    const commandesJour = (donnees.value.commandes || []).filter((commande) => {
      const livraison = normaliserDate(commande.date_livraison);
      if (!livraison) return false;
      return formatDateISO(livraison) === dateKey;
    });

    return {
      date,
      dateKey,
      nom: capitaliser(new Intl.DateTimeFormat('fr-FR', { weekday: 'long' }).format(date)),
      dateLabel: new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(date),
      commandes: commandesJour,
    };
  });
});

function statutClasse(statut) {
  return {
    brouillon: 'gris',
    a_verifier: 'jaune',
    validee: 'vert',
    archivee: 'bleu',
  }[statut] || 'gris';
}

function libelleStatut(statut) {
  return {
    brouillon: 'Brouillon',
    a_verifier: 'À vérifier',
    validee: 'Validée',
    archivee: 'Archivée',
  }[statut] || statut;
}

async function chargerSemaine() {
  chargement.value = true;
  try {
    const reponse = await api.get('/commandes/semaine?date=' + formatDateISO(semaineSelectionnee.value));
    donnees.value = reponse;
  } finally {
    chargement.value = false;
  }
}

function semainePrecedente() {
  const nouvelleSemaine = new Date(semaineSelectionnee.value);
  nouvelleSemaine.setDate(nouvelleSemaine.getDate() - 7);
  semaineSelectionnee.value = nouvelleSemaine;
  chargerSemaine();
}

function retourVersSemaineCourante() {
  if (estSemaineCourante.value) return;
  semaineSelectionnee.value = lundiDeLaSemaine(aujourdHui);
  chargerSemaine();
}

function semaineSuivante() {
  const nouvelleSemaine = new Date(semaineSelectionnee.value);
  nouvelleSemaine.setDate(nouvelleSemaine.getDate() + 7);
  semaineSelectionnee.value = nouvelleSemaine;
  chargerSemaine();
}

onMounted(() => {
  chargerSemaine();
});
</script>

<style scoped>
.page { max-width: 1200px; margin: 0 auto; padding: 24px 16px 36px; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
h1 { margin: 0; font-size: 1.4rem; color: #1a2a4a; }
.sub { margin: 2px 0 0; color: #7a8898; font-size: 0.85rem; }
.toolbar { display: flex; align-items: center; gap: 12px; }
.week-toolbar { background: white; border: 1px solid #e4dfcf; border-radius: 10px; padding: 6px 12px; box-shadow: 0 1px 6px rgba(0,0,0,0.06); }
.week-range { min-width: 220px; text-align: center; font-size: 0.9rem; color: #1a2a4a; font-weight: 600; }
.btn { border: none; background: #1a2a4a; color: white; padding: 8px 12px; border-radius: 8px; cursor: pointer; font-size: 0.8rem; font-weight: 600; }
.btn:hover { opacity: 0.94; }
.btn:disabled, .btn[disabled] { background: #d4d4d4; color: #7a7a7a; cursor: not-allowed; opacity: 1; }
.btn-nav { border: none; background: #f0efe8; color: #1a2a4a; border-radius: 8px; width: 34px; height: 34px; cursor: pointer; font-size: 1rem; }
.btn-nav:hover { background: #e7e2d3; }
.btn-current { min-width: 110px; }
.etat { padding: 40px; text-align: center; color: #7a8898; }
.week-grid { display: grid; grid-template-columns: repeat(7, minmax(160px, 1fr)); gap: 14px; }
.day-card { background: white; border-radius: 12px; box-shadow: 0 1px 6px rgba(0,0,0,0.08); padding: 12px; min-height: 220px; border: 1px solid transparent; }
.day-card-today { background: #f1f8f3; border-color: #2f6f4f; box-shadow: 0 0 0 1px rgba(47,111,79,0.12), 0 1px 6px rgba(0,0,0,0.08); }
.day-header { border-bottom: 1px solid #f0ece0; padding-bottom: 8px; margin-bottom: 10px; }
.day-header h2 { margin: 0; font-size: 0.95rem; color: #1a2a4a; }
.day-header span { display: inline-block; margin-top: 4px; color: #657386; font-size: 0.75rem; }
.delivery-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.delivery-item { display: flex; flex-direction: column; gap: 6px; background: #faf7f1; border: 1px solid #efe9db; border-radius: 8px; padding: 8px 10px; }
.delivery-main { display: flex; flex-direction: column; gap: 2px; color: #1a2a4a; }
.delivery-number { color: #5a6070; font-size: 0.72rem; font-family: monospace; }
.empty { margin: 12px 0 0; font-size: 0.82rem; color: #7a8898; text-align: center; }
.badge-statut { display: inline-flex; align-items: center; justify-content: center; width: fit-content; min-width: 88px; padding: 4px 8px; border-radius: 999px; font-size: 0.69rem; font-weight: 700; line-height: 1.4; }
.badge-statut.vert { background: #eef6ec; color: #2f6f4f; }
.badge-statut.jaune { background: #fff4d6; color: #8a6400; }
.badge-statut.gris { background: #f0ece0; color: #5a4a30; }
.badge-statut.bleu { background: #eaf3ff; color: #1d5fbf; }
@media (max-width: 1000px) {
  .week-grid { grid-template-columns: repeat(2, minmax(180px, 1fr)); }
}
@media (max-width: 640px) {
  .week-grid { grid-template-columns: 1fr; }
  .week-range { min-width: 0; }
}
</style>
