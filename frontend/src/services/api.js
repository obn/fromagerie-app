import { authState, logout } from './auth';

const BASE_URL = '/api';

function headersAuth(extra = {}) {
  const headers = { ...extra };
  if (authState.token) headers.Authorization = `Bearer ${authState.token}`;
  return headers;
}

async function handle(response) {
  if (response.status === 401) {
    // Session expiree ou invalide : on deconnecte proprement et on renvoie
    // vers l'ecran de connexion plutot que de laisser l'app dans un etat incoherent.
    logout();
    window.location.href = '/login';
    throw new Error('Session expirée, merci de vous reconnecter');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Erreur HTTP ${response.status}`);
  }
  return response.json();
}

export const api = {
  get(path) {
    return fetch(`${BASE_URL}${path}`, { headers: headersAuth() }).then(handle);
  },
  post(path, data) {
    return fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: headersAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    }).then(handle);
  },
  patch(path, data) {
    return fetch(`${BASE_URL}${path}`, {
      method: 'PATCH',
      headers: headersAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    }).then(handle);
  },
  delete(path) {
    return fetch(`${BASE_URL}${path}`, { method: 'DELETE', headers: headersAuth() }).then(handle);
  },
};