exports.up = function (knex) {
  return knex.schema.createTable('lignes_commande', (table) => {
    table.increments('id').primary();
    table
      .integer('commande_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('commandes')
      .onDelete('CASCADE');

    table.string('code_interne', 50).nullable();
    table
      .integer('produit_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('produits')
      .onDelete('SET NULL')
      .comment('NULL si non resolu / a verifier');

    table.string('designation_brute', 255).nullable().comment('designation telle que lue dans le PDF');
    table.decimal('quantite', 10, 3).nullable();
    table.string('unite', 20).nullable();

    table
      .enu('certitude', ['haute', 'a_verifier', 'non_fiable'], {
        useNative: true,
        enumName: 'certitude_ligne',
      })
      .notNullable()
      .defaultTo('a_verifier');

    table.text('ligne_brute').nullable().comment('texte brut original, utile en cas de chevauchement PDF');
    table.boolean('validee_manuellement').notNullable().defaultTo(false);

    table.timestamps(true, true);

    table.index('produit_id');
    table.index('certitude');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('lignes_commande');
};
