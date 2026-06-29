<template>
  <nav class="nav">
    <router-link to="/">Carnet du jour</router-link>
    <router-link to="/commandes">Commandes</router-link>
    <router-link to="/referentiels">Référentiels</router-link>
    <router-link to="/parametres">Paramètres</router-link>
  </nav>
  <router-view />
</template>

<style>
  body { margin: 0; font-family: -apple-system, 'Segoe UI', system-ui, sans-serif; background: #e7e2d3; }
  .nav { display: flex; gap: 16px; padding: 12px 18px; background: #1a2a4a; }
  .nav a { color: white; text-decoration: none; font-size: 0.9rem; opacity: 0.8; }
  .nav a.router-link-active { opacity: 1; font-weight: 600; }
</style>
