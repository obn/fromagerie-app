require('dotenv').config();

// Railway expose en general une variable unique MYSQL_URL (ou DATABASE_URL).
// mysql2 n'accepte pas "connectionString" directement : on parse l'URL
// nous-memes pour pouvoir y ajouter l'option ssl (necessaire sur MySQL 9.x).
function construireConnection() {
  if (process.env.MYSQL_URL) {
    const url = new URL(process.env.MYSQL_URL);
    return {
      host: url.hostname,
      port: url.port || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ''),
      charset: 'utf8mb4',
      ssl: { rejectUnauthorized: false },
    };
  }
  return {
    host: process.env.MYSQLHOST || '127.0.0.1',
    port: process.env.MYSQLPORT || 3306,
    user: process.env.MYSQLUSER || 'root',
    password: process.env.MYSQLPASSWORD || '',
    database: process.env.MYSQLDATABASE || 'fromagerie',
    charset: 'utf8mb4',
  };
}

module.exports = {
  client: 'mysql2',
  connection: construireConnection(),
  pool: { min: 0, max: 10 },
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: './seeds',
  },
};