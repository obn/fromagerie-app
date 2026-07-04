import { reactive } from 'vue';

const STORAGE_KEY = 'fromagerie_auth';

function chargerDepuisStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { token: null, utilisateur: null };
  } catch (e) {
    return { token: null, utilisateur: null };
  }
}

// Etat reactif partage par toute l'application (singleton)
export const authState = reactive(chargerDepuisStorage());

function sauvegarder() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: authState.token, utilisateur: authState.utilisateur }));
}

export async function login(email, motDePasse) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, motDePasse }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Échec de connexion');

  authState.token = data.token;
  authState.utilisateur = data.utilisateur;
  sauvegarder();
  return data.utilisateur;
}

export function logout() {
  authState.token = null;
  authState.utilisateur = null;
  localStorage.removeItem(STORAGE_KEY);
}

export function estConnecte() {
  return !!authState.token;
}

export function estAdmin() {
  return authState.utilisateur?.role === 'admin';
}

/**
 * Verifie la session aupres du serveur (utile au chargement de l'app pour
 * detecter un token expire cote client avant de faire des appels inutiles).
 */
export async function verifierSession() {
  if (!authState.token) return false;
  try {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${authState.token}` },
    });
    if (!res.ok) { logout(); return false; }
    const utilisateur = await res.json();
    authState.utilisateur = utilisateur;
    sauvegarder();
    return true;
  } catch (e) {
    return false;
  }
}
