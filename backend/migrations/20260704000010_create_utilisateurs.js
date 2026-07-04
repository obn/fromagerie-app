exports.up = async function (knex) {
  await knex.schema.createTable('utilisateurs', (table) => {
    table.increments('id').primary();
    table.string('email', 190).notNullable().unique();
    table.string('nom', 100).nullable();
    table.string('mot_de_passe_hash', 255).notNullable();
    table.enu('role', ['admin', 'gestionnaire']).notNullable().defaultTo('gestionnaire');
    table.boolean('actif').notNullable().defaultTo(true);
    table.timestamp('derniere_connexion').nullable();
    table.timestamps(true, true);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('utilisateurs');
};
