const mysql = require("mysql2/promise");

function getPool() {
  return mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    charset: "utf8mb4",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
}

// Igual a tu quote_ident: solo [A-Za-z0-9_]
function quoteIdent(name) {
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error(`Identificador inválido: ${name}`);
  }
  return `\`${name}\``;
}

function isBiCol(col) {
  return String(col).toLowerCase().includes("bi");
}

module.exports = { getPool, quoteIdent, isBiCol };
