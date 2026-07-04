/**
 * Cree un utilisateur (admin ou gestionnaire) de maniere interactive.
 * Le mot de passe n'est jamais stocke ni affiche en clair, ni commite
 * dans un fichier — saisi au clavier puis hashe immediatement.
 *
 * Usage : node src/auth/creer-utilisateur.js
 */

require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcryptjs');
const knex = require('../db/knex');

function poser(question, { masquer = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    if (masquer) {
      // Masque la saisie du mot de passe dans le terminal
      rl._writeToOutput = function (str) {
        if (str.includes('\n') || str.trim() === '') rl.output.write(str);
        else rl.output.write('*');
      };
    }

    rl.question(question, (reponse) => {
      rl.close();
      resolve(reponse.trim());
    });
  });
}

async function main() {
  console.log('\n=== Création d\'un utilisateur ===\n');

  const email = await poser('Email : ');
  const nom = await poser('Nom (optionnel) : ');
  const role = (await poser('Rôle (admin / gestionnaire) [gestionnaire] : ')) || 'gestionnaire';

  if (!['admin', 'gestionnaire'].includes(role)) {
    console.error('\n❌ Rôle invalide — doit être "admin" ou "gestionnaire"');
    process.exit(1);
  }

  const motDePasse = await poser('Mot de passe : ', { masquer: true });
  console.log('');

  if (!email || !motDePasse || motDePasse.length < 8) {
    console.error('❌ Email requis et mot de passe d\'au moins 8 caractères requis');
    process.exit(1);
  }

  const existant = await knex('utilisateurs').whereRaw('LOWER(email) = ?', [email.toLowerCase()]).first();
  if (existant) {
    console.error(`❌ Un utilisateur avec l'email "${email}" existe déjà`);
    process.exit(1);
  }

  const hash = await bcrypt.hash(motDePasse, 12);

  await knex('utilisateurs').insert({
    email,
    nom: nom || null,
    mot_de_passe_hash: hash,
    role,
    actif: true,
  });

  console.log(`✅ Utilisateur "${email}" créé avec le rôle "${role}"`);
}

main()
  .then(() => knex.destroy())
  .catch((e) => {
    console.error('Erreur :', e.message);
    knex.destroy();
    process.exit(1);
  });