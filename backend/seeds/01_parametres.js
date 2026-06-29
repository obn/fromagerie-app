exports.seed = async function (knex) {
  await knex('parametres').del();
  await knex('parametres').insert([
    {
      cle: 'gmail_label_commandes',
      valeur: 'commandes validées',
      description: 'Nom du label Gmail surveillé pour la récupération automatique des commandes',
    },
    {
      cle: 'gmail_poll_interval_minutes',
      valeur: '15',
      description: 'Fréquence de vérification de la boîte Gmail (en minutes)',
    },
    {
      cle: 'seuil_certitude_auto_validation',
      valeur: 'haute',
      description: 'Seuil de certitude à partir duquel une ligne de commande peut être validée automatiquement',
    },
  ]);
};
