exports.up = function (knex) {
  return knex.schema.createTable('clients', (table) => {
    table.increments('id').primary();
    table.string('nom', 100).notNullable().unique().comment('ex: DISTRAL, SCAPALYON, LOGIFRESH');
    table.string('jour_fixe_livraison', 20).nullable().comment('ex: jeudi, mardi, variable');
    table.boolean('actif').notNullable().defaultTo(true);
    table.text('notes').nullable();
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('clients');
};
