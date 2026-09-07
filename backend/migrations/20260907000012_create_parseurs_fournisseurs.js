exports.up = async function (knex) {
  await knex.schema.createTable('parseurs_fournisseurs', (table) => {
    table.increments('id').primary();
    table.string('nom_fournisseur', 100).notNullable().unique()
      .comment('Doit correspondre a clients.nom pour la resolution du client');
    table.string('mots_cles_detection', 255).notNullable()
      .comment('Mots recherches (insensible casse) dans le texte du PDF ou le nom du fichier pour identifier ce fournisseur');
    table.string('regex_numero_commande', 255).notNullable();
    table.string('regex_date_commande', 255).nullable();
    table.string('regex_date_livraison', 255).nullable();
    table.text('regex_ligne_produit').notNullable()
      .comment('Doit capturer dans cet ordre : code_interne, designation, quantite, dlc (optionnelle)');
    table.enu('format_annee', ['2_chiffres', '4_chiffres']).notNullable().defaultTo('2_chiffres');
    table.boolean('actif').notNullable().defaultTo(true);
    table.text('notes').nullable().comment('Notes libres, ex: exemple de ligne source, particularites');
    table.timestamps(true, true);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('parseurs_fournisseurs');
};
