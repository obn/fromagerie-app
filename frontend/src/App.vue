<template>
  <nav v-if="!estPageLogin" class="nav">
    <router-link to="/">Carnet du jour</router-link>
    <router-link to="/commandes">Commandes</router-link>
    <router-link to="/livraisons">Livraisons</router-link>
    <router-link v-if="estAdminRef" to="/referentiels">Référentiels</router-link>
    <router-link v-if="estAdminRef" to="/parametres">Paramètres</router-link>
    <span class="nav-spacer"></span>
    <span class="nav-user" v-if="authState.utilisateur">
      {{ authState.utilisateur.nom || authState.utilisateur.email }}
      <span class="nav-role">{{ authState.utilisateur.role === 'admin' ? 'Admin' : 'Gestionnaire' }}</span>
    </span>
    <a href="#" class="nav-logout" @click.prevent="seDeconnecter">Déconnexion</a>
  </nav>
  <router-view />
</template>

<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { authState, logout, estAdmin } from './services/auth';

const route = useRoute();
const router = useRouter();

const estPageLogin = computed(() => route.name === 'login');
const estAdminRef = computed(() => estAdmin());

function seDeconnecter() {
  logout();
  router.push('/login');
}
</script>

<style>
  body { margin: 0; font-family: -apple-system, 'Segoe UI', system-ui, sans-serif; background: #e7e2d3; }
  .nav {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 18px;
    background: #1a2a4a;
    overflow-x: auto;
    white-space: nowrap;
    -webkit-overflow-scrolling: touch;
  }
  .nav a {
    color: white;
    text-decoration: none;
    font-size: 0.9rem;
    opacity: 0.8;
    flex-shrink: 0; /* jamais de retour a la ligne, on scrolle plutot */
  }
  .nav a.router-link-active { opacity: 1; font-weight: 600; }
  .nav-spacer { flex: 1; min-width: 12px; }
  .nav-user { color: white; opacity: 0.85; font-size: 0.82rem; display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .nav-role { background: rgba(255,255,255,0.15); padding: 2px 8px; border-radius: 10px; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
  .nav-logout { color: white; opacity: 0.7; font-size: 0.82rem; flex-shrink: 0; }
  .nav-logout:hover { opacity: 1; }
</style>
