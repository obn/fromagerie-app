import { createRouter, createWebHistory } from 'vue-router';
import CarnetCommandes from '../views/CarnetCommandes.vue';
import Commandes from '../views/Commandes.vue';
import Livraisons from '../views/Livraisons.vue';
import Referentiels from '../views/Referentiels.vue';
import Parametres from '../views/Parametres.vue';
import Login from '../views/Login.vue';
import { estConnecte, estAdmin } from '../services/auth';

const routes = [
  { path: '/login', name: 'login', component: Login, meta: { public: true } },
  { path: '/', name: 'carnet', component: CarnetCommandes },
  { path: '/commandes', name: 'commandes', component: Commandes },
  { path: '/livraisons', name: 'livraisons', component: Livraisons },
  { path: '/referentiels', name: 'referentiels', component: Referentiels, meta: { adminUniquement: true } },
  { path: '/parametres', name: 'parametres', component: Parametres, meta: { adminUniquement: true } },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Garde de navigation : bloque l'acces si non connecte, ou si la route est
// reservee aux admins et que l'utilisateur est "gestionnaire".
router.beforeEach((to) => {
  if (to.meta.public) return true;

  if (!estConnecte()) {
    return { name: 'login' };
  }

  if (to.meta.adminUniquement && !estAdmin()) {
    // Un gestionnaire qui tente d'acceder a une page admin est renvoye au carnet
    return { name: 'carnet' };
  }

  return true;
});

export default router;
