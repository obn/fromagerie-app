exports.up = function (knex) {
  return knex.schema.alterTable('lignes_commande', (table) => {
    table.boolean('fait').notNullable().defaultTo(false).comment('coche du carnet de commandes (preparation terminee)');
    table.date('dlc').nullable().comment('date limite de consommation saisie a la preparation');
    table.string('numero_lot', 50).nullable();
    table.timestamp('fait_le').nullable().comment('horodatage de la coche, pour tracabilite');

    table.index('fait');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('lignes_commande', (table) => {
    table.dropColumn('fait');
    table.dropColumn('dlc');
    table.dropColumn('numero_lot');
    table.dropColumn('fait_le');
  });
};
