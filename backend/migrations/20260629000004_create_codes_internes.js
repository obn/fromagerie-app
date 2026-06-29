exports.up = function (knex) {
  return knex.schema.createTable('codes_internes', (table) => {
    table.increments('id').primary();
    table
      .integer('client_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('clients')
      .onDelete('CASCADE');
    table.string('code_interne', 50).notNullable().comment('ex: FBE09, FBN08, 2932800');
    table
      .integer('produit_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('produits')
      .onDelete('SET NULL')
      .comment('NULL tant que la correspondance n a pas ete validee manuellement');
    table.timestamps(true, true);

    table.unique(['client_id', 'code_interne']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('codes_internes');
};
