import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";
import { envPath, loadedKeys } from "../loadEnv.js";

const {Pool} = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    `DATABASE_URL não definida. Arquivo verificado: ${envPath}\n` +
      `Chaves encontradas nesse arquivo: ${loadedKeys.length ? loadedKeys.join(", ") : "(nenhuma — o arquivo está vazio, não existe, ou não pôde ser lido)"}`
  );
}

export const pool = new Pool ({
 connectionString: process.env.DATABASE_URL,
 max: 10,
});

export const db = drizzle(pool, {schema});