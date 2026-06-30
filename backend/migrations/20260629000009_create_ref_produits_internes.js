exports.up = async function (knex) {
  await knex.schema.createTable('familles_produits', (table) => {
    table.integer('code').primary().comment('ex: 241, 242, 25');
    table.string('libelle', 255).notNullable();
    table.timestamps(true, true);
  });

  await knex.schema.createTable('ref_produits_internes', (table) => {
    table.string('code_interne', 20).primary().comment('code maison du producteur, ex: FBN08, FBE09');
    table
      .integer('famille_code')
      .nullable()
      .references('code')
      .inTable('familles_produits')
      .onDelete('SET NULL');
    table.string('libelle_produit', 255).notNullable();
    table.timestamps(true, true);

    table.index('famille_code');
    table.index('libelle_produit');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('ref_produits_internes');
  await knex.schema.dropTableIfExists('familles_produits');
};