/**
 * Planificateur de sync Gmail (cron).
 * La fréquence est lue depuis la table parametres (cle: gmail_poll_interval_minutes).
 * Valeur par défaut : 15 minutes.
 *
 * Désactivé si GMAIL_REFRESH_TOKEN n'est pas configuré dans l'environnement.
 */

const cron = require('node-cron');
const knex = require('../db/knex');

let tacheEnCours = null;

async function getIntervalleMinutes() {
  try {
    const param = await knex('parametres').where({ cle: 'gmail_poll_interval_minutes' }).first();
    return parseInt(param?.valeur || '15', 10);
  } catch (e) {
    return 15;
  }
}

function intervalleEnExpression(minutes) {
  if (minutes < 1) return '*/1 * * * *';
  if (minutes >= 60) {
    const heures = Math.floor(minutes / 60);
    return `0 */${heures} * * *`;
  }
  return `*/${minutes} * * * *`;
}

async function demarrerCron() {
  if (!process.env.GMAIL_REFRESH_TOKEN) {
    console.log('[cron] GMAIL_REFRESH_TOKEN absent — sync automatique désactivée');
    return;
  }

  const minutes = await getIntervalleMinutes();
  const expression = intervalleEnExpression(minutes);

  console.log(`[cron] Sync Gmail toutes les ${minutes} min (${expression})`);

  if (tacheEnCours) tacheEnCours.stop();

  tacheEnCours = cron.schedule(expression, async () => {
    console.log('[cron] Déclenchement sync Gmail…');
    try {
      const { syncGmail } = require('../gmail');
      await syncGmail();
    } catch (e) {
      console.error('[cron] Erreur sync Gmail :', e.message);
    }
  });
}

module.exports = { demarrerCron };
