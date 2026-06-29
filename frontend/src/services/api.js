const BASE_URL = '/api';

async function handle(response) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Erreur HTTP ${response.status}`);
  }
  return response.json();
}

export const api = {
  get(path) {
    return fetch(`${BASE_URL}${path}`).then(handle);
  },
  post(path, data) {
    return fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(handle);
  },
  patch(path, data) {
    return fetch(`${BASE_URL}${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(handle);
  },
  delete(path) {
    return fetch(`${BASE_URL}${path}`, { method: 'DELETE' }).then(handle);
  },
};
