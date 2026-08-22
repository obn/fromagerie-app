require('dotenv').config();

// DIAGNOSTIC TEMPORAIRE — a retirer une fois le probleme resolu
console.log('[DIAGNOSTIC] MYSQL_URL présente ?', !!process.env.MYSQL_URL);
console.log('[DIAGNOSTIC] MYSQL_URL longueur :', (process.env.MYSQL_URL || '').length);
console.log('[DIAGNOSTIC] Toutes les vars MYSQL* :', Object.keys(process.env).filter(k => k.includes('MYSQL')));

// Railway expose en general une variable unique MYSQL_URL (ou DATABASE_URL).
// On supporte les deux : soit une URL complete, soit des variables separees.
const connection = process.env.MYSQL_URL
  ? process.env.MYSQL_URL
  : {
      host: process.env.MYSQLHOST || '127.0.0.1',
      port: process.env.MYSQLPORT || 3306,
      user: process.env.MYSQLUSER || 'root',
      password: process.env.MYSQLPASSWORD || '',
      database: process.env.MYSQLDATABASE || 'fromagerie',
      charset: 'utf8mb4',
    };

module.exports = {
  client: 'mysql2',
  connection,
  pool: { min: 0, max: 10 },
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: './seeds',
  },
};
