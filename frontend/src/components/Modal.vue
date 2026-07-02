<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h3>{{ titre }}</h3>
        <button class="btn-close" @click="$emit('close')">✕</button>
      </div>
      <div class="modal-body">
        <slot />
      </div>
      <div class="modal-footer">
        <button class="btn secondary" @click="$emit('close')">Annuler</button>
        <button class="btn primary" @click="$emit('confirm')">{{ labelConfirm }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({ titre: String, labelConfirm: { type: String, default: 'Enregistrer' } });
defineEmits(['close', 'confirm']);
</script>

<style scoped>
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 16px; }
.modal { background: white; border-radius: 12px; width: 100%; max-width: 520px; box-shadow: 0 8px 40px rgba(0,0,0,0.22); }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #e8e3d5; }
.modal-header h3 { margin: 0; font-size: 1rem; color: #1a2a4a; }
.btn-close { border: none; background: none; font-size: 1rem; cursor: pointer; color: #7a8898; padding: 4px 8px; border-radius: 4px; }
.btn-close:hover { background: #f0ece0; }
.modal-body { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
.modal-footer { padding: 14px 20px; border-top: 1px solid #e8e3d5; display: flex; justify-content: flex-end; gap: 8px; }
.btn { padding: 8px 20px; border-radius: 6px; border: none; font-size: 0.88rem; cursor: pointer; font-weight: 600; }
.btn.primary { background: #2f6f4f; color: white; }
.btn.secondary { background: #f0ece0; color: #1a2a4a; }
</style>
