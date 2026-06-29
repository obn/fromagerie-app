exports.up = function (knex) {
  return knex.schema.createTable('parametres', (table) => {
    table.increments('id').primary();
    table.string('cle', 100).notNullable().unique();
    table.text('valeur').nullable();
    table.string('description', 255).nullable();
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('parametres');
};
