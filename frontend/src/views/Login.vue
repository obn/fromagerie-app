<template>
  <div class="login-page">
    <form class="login-card" @submit.prevent="soumettre">
      <h1>Fromagerie</h1>
      <p class="sub">Gestion des commandes</p>

      <label>
        Email
        <input v-model="email" type="email" required autocomplete="username" class="inp" />
      </label>
      <label>
        Mot de passe
        <div class="password-wrap">
          <input
            v-model="motDePasse"
            :type="motDePasseVisible ? 'text' : 'password'"
            required
            autocomplete="current-password"
            class="inp"
          />
          <button type="button" class="btn-visibility" @click="motDePasseVisible = !motDePasseVisible">
            {{ motDePasseVisible ? 'Masquer' : 'Voir' }}
          </button>
        </div>
      </label>

      <p v-if="erreur" class="erreur">{{ erreur }}</p>

      <button class="btn primary" :disabled="enCours" type="submit">
        {{ enCours ? 'Connexion…' : 'Se connecter' }}
      </button>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { login } from '../services/auth';

const router = useRouter();
const email = ref('');
const motDePasse = ref('');
const motDePasseVisible = ref(false);
const erreur = ref('');
const enCours = ref(false);

async function soumettre() {
  erreur.value = '';
  enCours.value = true;
  try {
    await login(email.value, motDePasse.value);
    router.push('/');
  } catch (e) {
    erreur.value = e.message;
  } finally {
    enCours.value = false;
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e7e2d3;
  padding: 20px;
}
.login-card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.12);
  padding: 40px 36px;
  width: 100%;
  max-width: 380px;
}
h1 { margin: 0; font-size: 1.5rem; color: #1a2a4a; text-align: center; }
.sub { margin: 4px 0 28px; color: #7a8898; text-align: center; font-size: 0.9rem; }
label { display: flex; flex-direction: column; gap: 6px; font-size: 0.85rem; font-weight: 600; color: #3a4a5a; margin-bottom: 16px; }
.inp { padding: 10px 12px; border: 1px solid #d0cbb8; border-radius: 6px; font-size: 0.95rem; }
.inp:focus { outline: none; border-color: #2f6f4f; box-shadow: 0 0 0 2px rgba(47,111,79,0.2); }
.password-wrap { position: relative; }
.password-wrap .inp { width: 100%; box-sizing: border-box; padding-right: 72px; }
.btn-visibility {
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  color: #2f6f4f;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  padding: 4px 6px;
}
.erreur { color: #b3261e; font-size: 0.85rem; margin: 0 0 16px; text-align: center; }
.btn { width: 100%; padding: 11px; border-radius: 6px; border: none; font-size: 0.95rem; font-weight: 600; cursor: pointer; }
.btn.primary { background: #2f6f4f; color: white; }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
