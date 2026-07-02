<template>
  <div class="overlay" @click.self="$emit('annuler')">
    <div class="box">
      <p>{{ message }}</p>
      <div class="actions">
        <button class="btn secondary" @click="$emit('annuler')">Annuler</button>
        <button class="btn danger" @click="$emit('confirmer')">Supprimer</button>
      </div>
    </div>
  </div>
</template>
<script setup>
defineProps({ message: String });
defineEmits(['annuler', 'confirmer']);
</script>
<style scoped>
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 300; display: flex; align-items: center; justify-content: center; padding: 16px; }
.box { background: white; border-radius: 10px; padding: 24px; max-width: 380px; width: 100%; box-shadow: 0 8px 32px rgba(0,0,0,0.2); }
.box p { margin: 0 0 20px; line-height: 1.5; color: #1a2a4a; }
.actions { display: flex; gap: 10px; justify-content: flex-end; }
.btn { padding: 8px 18px; border-radius: 6px; border: none; font-size: 0.88rem; cursor: pointer; font-weight: 600; }
.btn.secondary { background: #f0ece0; color: #1a2a4a; }
.btn.danger { background: #b3261e; color: white; }
</style>
