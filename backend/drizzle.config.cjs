const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const { defineConfig } = require("drizzle-kit");

const envPath = path.resolve(__dirname, ".env");

if (!process.env.DATABASE_URL) {
  throw new Error(`DATABASE_URL não definida. Verifique se o arquivo existe em: ${envPath}`);
}

// Algumas versões do drizzle-kit não aceitam "url" para o driver MySQL —
// por isso quebramos a URL manualmente nos campos host/port/user/password/database.
const dbUrl = new URL(process.env.DATABASE_URL);

module.exports = defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema.js",
  out: "./drizzle",
  dbCredentials: {
    host: dbUrl.hostname,
    port: dbUrl.port ? Number(dbUrl.port) : 3306,
    user: decodeURIComponent(dbUrl.username),
    password: decodeURIComponent(dbUrl.password),
    database: dbUrl.pathname.replace(/^\//, ""),
  },
});
