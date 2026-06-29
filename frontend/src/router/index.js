import { createRouter, createWebHistory } from 'vue-router';
import CarnetCommandes from '../views/CarnetCommandes.vue';
import Commandes from '../views/Commandes.vue';
import Referentiels from '../views/Referentiels.vue';
import Parametres from '../views/Parametres.vue';

const routes = [
  { path: '/', name: 'carnet', component: CarnetCommandes },
  { path: '/commandes', name: 'commandes', component: Commandes },
  { path: '/referentiels', name: 'referentiels', component: Referentiels },
  { path: '/parametres', name: 'parametres', component: Parametres },
];

export default createRouter({
  history: createWebHistory(),
  routes,
});
