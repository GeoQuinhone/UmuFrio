import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "./schema.js";
import { envPath } from "../loadEnv.js";

if (!process.env.DATABASE_URL) {
  throw new Error(`DATABASE_URL não definida. Verifique se o arquivo existe em: ${envPath}`);
}

export const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  connectionLimit: 10,
});

export const db = drizzle(pool, { schema, mode: "default" });