exports.up = function (knex) {
  return knex.schema.createTable('tarifs_client_produit', (table) => {
    table.increments('id').primary();
    table
      .integer('client_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('clients')
      .onDelete('CASCADE');
    table
      .integer('produit_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('produits')
      .onDelete('CASCADE');
    table.integer('pcb').nullable().comment('par combien / conditionnement');
    table.decimal('poids', 8, 3).nullable().comment('poids unitaire en kg si applicable');
    table.decimal('tarif_general', 10, 2).nullable();
    table.decimal('remise_pct', 6, 2).nullable().comment('remise en %, ex 18.80');
    table.decimal('tarif_net', 10, 2).nullable().comment('tarif net facture');
    table.string('unite_facturation', 20).nullable().comment('KG, Pièce... peut differer de produits.unite');
    table.timestamps(true, true);

    table.unique(['client_id', 'produit_id']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('tarifs_client_produit');
};
