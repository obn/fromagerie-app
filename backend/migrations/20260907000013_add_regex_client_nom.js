exports.up = async function (knex) {
  await knex.schema.alterTable('parseurs_fournisseurs', (table) => {
    table.string('regex_client_nom', 255).nullable().after('mots_cles_detection')
      .comment('Si renseignee : extrait le nom du client (magasin/site) directement depuis le texte du PDF (groupe capture 1), au lieu d\'utiliser nom_fournisseur comme client fixe. Utile pour les templates partages entre plusieurs magasins (ex: reseau Boucherie Andre).');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('parseurs_fournisseurs', (table) => {
    table.dropColumn('regex_client_nom');
  });
};
