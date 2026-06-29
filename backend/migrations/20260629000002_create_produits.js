exports.up = function (knex) {
  return knex.schema.createTable('produits', (table) => {
    table.increments('id').primary();
    table.string('gencod', 20).notNullable().unique().comment('code barre / reference produit (issu du referentiel)');
    table.string('designation', 255).notNullable();
    table.string('unite', 20).nullable().comment('Kg, Pièce, kg, pièce...');
    table.integer('dluo_jours').nullable().comment('DLUO en jours, ex 30, 45, 60');
    table.boolean('actif').notNullable().defaultTo(true);
    table.timestamps(true, true);

    table.index('designation');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('produits');
};
