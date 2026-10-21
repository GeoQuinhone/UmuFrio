import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pool } from "./client.js";

// Executa backend/seed-fase4.sql (carga de dados de teste da Fase 4).
// Como o script APAGA clientes, agendamentos, ordens, cobranças PIX e
// movimentações de estoque, exige a confirmação explícita --sim:
//   npm run db:seed -- --sim

const aqui = path.dirname(fileURLToPath(import.meta.url));
const arquivo = path.resolve(aqui, "../../seed-fase4.sql");

if (!process.argv.includes("--sim")) {
  console.log(
    "Este comando APAGA clientes, agendamentos, ordens de serviço, cobranças PIX,\n" +
      "check-ins e movimentações de estoque do banco configurado em DATABASE_URL e cria dados\n" +
      "de teste. Para confirmar, rode:\n\n  npm run db:seed -- --sim\n",
  );
  await pool.end();
  process.exit(1);
}

if (process.env.NODE_ENV === "production") {
  console.error("Recusado: NODE_ENV=production. Use apenas em banco de teste.");
  await pool.end();
  process.exit(1);
}

try {
  await pool.query(fs.readFileSync(arquivo, "utf8"));
  const [{ rows: clientes }, { rows: agendamentos }, { rows: ordens }] =
    await Promise.all([
      pool.query("SELECT count(*)::int AS n FROM clientes"),
      pool.query("SELECT count(*)::int AS n FROM agendamentos"),
      pool.query("SELECT count(*)::int AS n FROM ordens_servico"),
    ]);
  console.log(
    `Dados de teste carregados: ${clientes[0].n} clientes, ` +
      `${agendamentos[0].n} agendamentos, ${ordens[0].n} ordens de serviço.\n` +
      "Logins (senha Teste@123): ceo@umufrio.com.br, atendente@umufrio.com.br, " +
      "tecnico1@umufrio.com.br, estoque@umufrio.com.br",
  );
} catch (erro) {
  console.error("Falha ao carregar os dados (nada foi alterado):", erro.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
