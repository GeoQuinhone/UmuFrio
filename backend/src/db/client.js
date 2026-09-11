import "dotenv/config";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "./schema.js";

if (!process.env.DATABASE_URL) {
    throw new Error (
        'DATABASE_URL não definida. Copie "env.example" para ".env" e ajuste usuário/senha/porta do seu MySQL.'
    );
}

export const pool = mysql.createPool({
    uri: process.env.DATABASE_URL,
    connectionLimit: 10,
});

export const db = drizzle(pool, {schema, mode: "default"});