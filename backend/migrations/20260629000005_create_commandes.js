exports.up = function (knex) {
  return knex.schema.createTable('commandes', (table) => {
    table.increments('id').primary();
    table.string('numero_commande', 50).notNullable();
    table
      .integer('client_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('clients')
      .onDelete('RESTRICT');

    table.date('date_commande').nullable();
    table.date('date_livraison').nullable().comment('date normalisee, utilisee pour historisation');
    table.string('date_livraison_pdf_brute', 50).nullable().comment('texte brut tel qu extrait du PDF');
    table.string('jour_fixe_client', 20).nullable();

    table
      .enu('statut', ['brouillon', 'a_verifier', 'validee', 'archivee'], {
        useNative: true,
        enumName: 'statut_commande',
      })
      .notNullable()
      .defaultTo('brouillon');

    table.enu('source', ['gmail', 'manuel'], { useNative: true, enumName: 'source_commande' })
      .notNullable()
      .defaultTo('manuel');

    table.string('gmail_message_id', 255).nullable().comment('id du mail source, pour eviter les doublons');
    table.string('fichier_pdf_url', 500).nullable().comment('lien vers le PDF source archive');

    table.timestamps(true, true);

    table.unique(['client_id', 'numero_commande']);
    table.index('date_livraison');
    table.index('date_commande');
    table.index('gmail_message_id');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('commandes');
};
