const fs = require("node:fs");
const path = require("node:path");
const { defineConfig } = require("drizzle-kit");

const envPath = path.resolve(__dirname, ".env");

// Implementação própria (sem depender do pacote "dotenv" para a leitura do
// arquivo) porque editores no Windows às vezes salvam o .env em UTF-16 ou
// com BOM, o que impedia o dotenv de reconhecer as variáveis mesmo com o
// conteúdo aparentando estar correto no terminal.
function parseEnvFile(filePath) {
  const buf = fs.readFileSync(filePath);
  let text;

  if (buf[0] === 0xff && buf[1] === 0xfe) {
    text = buf.slice(2).toString("utf16le");
  } else if (buf[0] === 0xfe && buf[1] === 0xff) {
    text = buf.slice(2).swap16().toString("utf16le");
  } else {
    text = buf.toString("utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  }

  const result = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
}

let loadedKeys = [];
if (fs.existsSync(envPath)) {
  const parsed = parseEnvFile(envPath);
  loadedKeys = Object.keys(parsed);
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    `DATABASE_URL não definida. Arquivo verificado: ${envPath}\n` +
      `Chaves encontradas nesse arquivo: ${loadedKeys.length ? loadedKeys.join(", ") : "(nenhuma — o arquivo está vazio, não existe, ou não pôde ser lido)"}`
  );
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
