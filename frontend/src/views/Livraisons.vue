<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>Livraisons</h1>
        <p class="sub">Par jour de la semaine</p>
      </div>

      <div class="toolbar week-toolbar">
        <button class="btn-nav" @click="semainePrecedente" aria-label="Semaine précédente">◀</button>
        <input type="date" class="inp" v-model="dateSelectionnee" @change="selectionnerDateIso($event.target.value)" aria-label="Sélectionner une date" />
        <button class="btn btn-current" :disabled="estSemaineCourante" @click="retourVersSemaineCourante" aria-label="Semaine courante">Aujourd'hui</button>
        <span class="week-range">{{ libellePeriode }}</span>
        <button class="btn-nav" @click="semaineSuivante" aria-label="Semaine suivante">▶</button>
      </div>
    </div>

    <div v-if="chargement" class="etat">Chargement…</div>

    <div v-else class="week-grid">
      <div v-for="jour in jours" :key="jour.dateKey" :class="['day-card', { 'day-card-today': estJourActuel(jour.dateKey) }]">
        <div class="day-header">
          <div class="day-title-row">
            <h2>{{ jour.nom }}</h2>
            <button class="btn-ico btn-day-products" type="button" title="Voir produits du jour" @click="ouvrirProduitsJour(jour)">🧀</button>
          </div>
          <span>{{ jour.dateLabel }}</span>
        </div>

        <ul v-if="jour.commandes.length" class="delivery-list">
          <li v-for="commande in jour.commandes" :key="commande.id" class="delivery-item">
            <div class="delivery-main">
              <strong>{{ commande.client_nom }}</strong>
              <div class="delivery-number-row">
                <span class="delivery-number">{{ commande.numero_commande }}</span>
                <button class="btn-ico btn-ico-eye" type="button" title="Voir les lignes" @click="ouvrirDetailCommande(commande)">👁</button>
              </div>
            </div>

            <div class="delivery-meta">
              <div class="delivery-status-row">
                <span :class="['badge-statut', statutClasse(commande.statut)]">{{ libelleStatut(commande.statut) }}</span>
              </div>
              <select class="status-select" :value="commande.statut" @change="changerStatut(commande, $event.target.value)">
                <option value="prevue">Prévue</option>
                <option value="en_cours">En cours</option>
                <option value="livree">Livrée</option>
                <option value="annulee">Annulée</option>
              </select>
            </div>

            <div v-if="commande.statut === 'livree' && commande.heure_reelle" class="delivery-time">
              Heure réelle : {{ formatHeure(commande.heure_reelle) }}
            </div>
          </li>
        </ul>

        <p v-else class="empty">Aucune livraison</p>
      </div>
    </div>

    <div v-if="panelOuvert" class="panel-overlay" @click.self="fermerDetailCommande">
      <div class="panel">
        <div class="panel-head">
          <h2>{{ commandeDetail?.client_nom || 'Commande' }} — N° {{ commandeDetail?.numero_commande || '—' }}</h2>
          <button class="btn-ico" type="button" @click="fermerDetailCommande" aria-label="Fermer">✕</button>
        </div>

        <div v-if="chargementDetail" class="etat">Chargement…</div>

        <table v-else class="tbl-lignes">
          <thead>
            <tr>
              <th>Qté</th>
              <th>Désignation</th>
              <th>Réf.</th>
              <th>Prix</th>
              <th>Certitude</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ligne in lignesDetail" :key="ligne.id" :class="'cert-' + (ligne.certitude || 'a_verifier')">
              <td class="num">{{ ligne.quantite }}</td>
              <td>{{ ligne.designation_brute }}</td>
              <td class="mono">{{ ligne.code_interne || ligne.reference || ligne.gencod || '—' }}</td>
              <td class="num prix">{{ formatPrix(ligne.tarif_net ?? ligne.prix) }}</td>
              <td><span :class="['badge-cert', ligne.certitude || 'a_verifier']">{{ ligne.certitude || 'À vérifier' }}</span></td>
            </tr>
            <tr v-if="!lignesDetail.length">
              <td colspan="5" class="empty-line">Aucune ligne pour cette commande.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Panel produits consolidés pour la journée -->
    <div v-if="panelProduitsOuvert" class="panel-overlay" @click.self="fermerPanelProduits">
      <div class="panel">
        <div class="panel-head">
          <h2>Produits — {{ panelJourInfo?.nom || '' }} {{ panelJourInfo?.dateLabel || '' }}</h2>
          <button class="btn-ico" type="button" @click="fermerPanelProduits" aria-label="Fermer">✕</button>
        </div>

        <div v-if="chargementProduits" class="etat">Chargement…</div>

        <table v-else class="tbl-lignes">
          <thead>
            <tr>
              <th>Qté</th>
              <th>Désignation</th>
              <th>Réf.</th>
              <th>Unité</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(p, idx) in produitsJour" :key="p.code || p.designation || idx">
              <td class="num">{{ p.quantite }}</td>
              <td>{{ p.designation }}</td>
              <td class="mono">{{ p.code || '—' }}</td>
              <td>{{ p.unite || '—' }}</td>
            </tr>
            <tr v-if="!produitsJour.length">
              <td colspan="4" class="empty-line">Aucun produit pour cette journée.</td>
            </tr>
          </tbody>
        </table>
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
const panelOuvert = ref(false);
const commandeDetail = ref(null);
const lignesDetail = ref([]);
const chargementDetail = ref(false);

// panel produits par jour
const panelProduitsOuvert = ref(false);
const produitsJour = ref([]);
const chargementProduits = ref(false);
const panelJourInfo = ref(null);

// date selector (ISO yyyy-mm-dd) displayed next to nav buttons
const dateSelectionnee = ref(formatDateISO(semaineSelectionnee.value));

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
    prevue: 'gris',
    en_cours: 'bleu',
    livree: 'vert',
    annulee: 'rouge',
  }[statut] || 'gris';
}

function libelleStatut(statut) {
  return {
    prevue: 'Prévue',
    en_cours: 'En cours',
    livree: 'Livrée',
    annulee: 'Annulée',
  }[statut] || statut;
}

function formatHeure(valeur) {
  if (!valeur) return '';
  const date = new Date(`1970-01-01T${valeur}`);
  if (Number.isNaN(date.getTime())) return valeur;
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function formatPrix(valeur) {
  if (valeur === null || valeur === undefined || valeur === '') return '—';
  const nombre = Number(String(valeur).replace(',', '.'));
  return Number.isFinite(nombre) ? `${nombre.toFixed(2)} €` : '—';
}

async function ouvrirDetailCommande(commande) {
  const commandeId = commande.commande_id || commande.id;
  panelOuvert.value = true;
  chargementDetail.value = true;
  commandeDetail.value = commande;
  lignesDetail.value = [];

  try {
    const detail = await api.get('/commandes/' + commandeId);
    commandeDetail.value = detail;
    lignesDetail.value = detail.lignes || [];
  } finally {
    chargementDetail.value = false;
  }
}

function fermerDetailCommande() {
  panelOuvert.value = false;
  commandeDetail.value = null;
  lignesDetail.value = [];
  chargementDetail.value = false;
}

async function ouvrirProduitsJour(jour) {
  panelProduitsOuvert.value = true;
  chargementProduits.value = true;
  panelJourInfo.value = jour;
  produitsJour.value = [];

  try {
    const commandes = (jour.commandes || []).slice();
    const ids = Array.from(new Set(commandes.map(c => c.commande_id || c.id).filter(Boolean)));
    if (!ids.length) {
      produitsJour.value = [];
      return;
    }

    const promesses = ids.map(id => api.get('/commandes/' + id).catch(() => null));
    const details = await Promise.all(promesses);
    const toutesLignes = [];
    details.forEach(d => {
      if (d && Array.isArray(d.lignes)) {
        d.lignes.forEach(l => toutesLignes.push(l));
      }
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
    produitsJour.value = liste;
  } finally {
    chargementProduits.value = false;
  }
}

function fermerPanelProduits() {
  panelProduitsOuvert.value = false;
  produitsJour.value = [];
  panelJourInfo.value = null;
  chargementProduits.value = false;
}

function selectionnerDateIso(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return;
  semaineSelectionnee.value = lundiDeLaSemaine(d);
  dateSelectionnee.value = iso;
  chargerSemaine();
}

async function changerStatut(livraison, statut) {
  const ancienStatut = livraison.statut;
  livraison.statut = statut;
  try {
    await api.patch('/commandes/livraisons/' + livraison.id, { statut });
  } catch (e) {
    livraison.statut = ancienStatut;
    throw e;
  }
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
  dateSelectionnee.value = formatDateISO(semaineSelectionnee.value);
  chargerSemaine();
}

function retourVersSemaineCourante() {
  if (estSemaineCourante.value) return;
  semaineSelectionnee.value = lundiDeLaSemaine(aujourdHui);
  dateSelectionnee.value = formatDateISO(semaineSelectionnee.value);
  chargerSemaine();
}

function semaineSuivante() {
  const nouvelleSemaine = new Date(semaineSelectionnee.value);
  nouvelleSemaine.setDate(nouvelleSemaine.getDate() + 7);
  semaineSelectionnee.value = nouvelleSemaine;
  dateSelectionnee.value = formatDateISO(semaineSelectionnee.value);
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
.day-title-row { display:flex; align-items:center; gap:8px; }
.day-header h2 { margin: 0; font-size: 0.95rem; color: #1a2a4a; }
.btn-day-products { font-size: 0.95rem; padding: 2px 6px; border-radius:6px; background: transparent; border: none; cursor: pointer; }
.btn-day-products:hover { background: #f0ece0; }
.day-header span { display: inline-block; margin-top: 4px; color: #657386; font-size: 0.75rem; }
.delivery-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
/* slightly more right padding so inline controls stay within card on small screens */
.delivery-item { display: flex; flex-direction: column; gap: 6px; background: #faf7f1; border: 1px solid #efe9db; border-radius: 8px; padding: 8px 12px; }
.delivery-main { display: flex; flex-direction: column; gap: 2px; color: #1a2a4a; }
.delivery-number-row { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.delivery-number { color: #5a6070; font-size: 0.72rem; font-family: monospace; }
.btn-ico-eye { font-size: 0.95rem; padding: 4px 6px; border-radius: 6px; }
.delivery-meta { display: flex; flex-direction: column; gap: 6px; }
/* keep badge in normal flow; eye icon moved next to number */
.delivery-status-row { display: flex; align-items: center; justify-content: flex-start; gap: 8px; }
.delivery-time { color: #2f6f4f; font-size: 0.72rem; font-weight: 600; }
.status-select { border: 1px solid #d0cbb8; border-radius: 6px; background: white; color: #1a2a4a; padding: 5px 8px; font-size: 0.72rem; }
.btn-ico { border: none; background: transparent; cursor: pointer; padding: 6px 8px; border-radius: 6px; font-size: 0.9rem; }
.btn-ico:hover { background: #f0ece0; }
.empty { margin: 12px 0 0; font-size: 0.82rem; color: #7a8898; text-align: center; }
.badge-statut { display: inline-flex; align-items: center; justify-content: center; width: fit-content; min-width: 88px; padding: 4px 8px; border-radius: 999px; font-size: 0.69rem; font-weight: 700; line-height: 1.4; }
.badge-statut.vert { background: #eef6ec; color: #2f6f4f; }
.badge-statut.jaune { background: #fff4d6; color: #8a6400; }
.badge-statut.gris { background: #f0ece0; color: #5a4a30; }
.badge-statut.bleu { background: #eaf3ff; color: #1d5fbf; }
.badge-statut.rouge { background: #fde8e8; color: #b3261e; }
.panel-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.35); z-index: 100; display: flex; justify-content: flex-end; }
.panel { width: 640px; max-width: 95vw; background: white; height: 100%; overflow-y: auto; box-shadow: -4px 0 20px rgba(0,0,0,0.15); }
.panel-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #e8e3d5; position: sticky; top: 0; background: white; z-index: 1; }
.panel-head h2 { margin: 0; font-size: 1rem; color: #1a2a4a; }
.tbl-lignes { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.tbl-lignes th { padding: 8px 14px; text-align: left; font-size: 0.71rem; text-transform: uppercase; color: #7a8898; border-bottom: 2px solid #e8e3d5; }
.tbl-lignes td { padding: 9px 14px; border-bottom: 1px solid #f0ece0; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.prix { font-weight: 700; color: #1a2a4a; }
.mono { font-family: monospace; font-size: 0.82rem; color: #4a7a5a; }
.badge-cert { font-size: 0.72rem; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
.badge-cert.haute { background: #eef6ec; color: #2f6f4f; }
.badge-cert.a_verifier { background: #fff3a0; color: #7a6000; }
.badge-cert.non_fiable { background: #fde8e8; color: #b3261e; }
.empty-line { text-align: center; color: #7a8898; }
@media (max-width: 1000px) {
  .week-grid { grid-template-columns: repeat(2, minmax(180px, 1fr)); }
}
@media (max-width: 640px) {
  .week-grid { grid-template-columns: 1fr; }
  .week-range { min-width: 0; }
}
</style>
