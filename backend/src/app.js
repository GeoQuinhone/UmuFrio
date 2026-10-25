import express from "express";
import cors from "cors";

import authRouter from "./routes/auth.js";
import clientesRouter from "./routes/clientes.js";
import usuariosRouter from "./routes/usuarios.js";
import agendamentosRouter from "./routes/agendamentos.js";
import servicosRouter from "./routes/servicos.js";
import ordensServicoRouter from "./routes/ordensServico.js";
import produtosRouter from "./routes/produtos.js";

import { requireAuth } from "./security.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

export const app = express();

// Em produção, CORS_ORIGIN lista os endereços do frontend autorizados a chamar
// a API (separados por vírgula). Sem a variável, como no ambiente local, a API
// aceita qualquer origem.
const origensPermitidas = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origem) => origem.trim().replace(/\/+$/, ""))
  .filter(Boolean);

app.use(
  cors(origensPermitidas.length ? { origin: origensPermitidas } : undefined),
);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);

app.use(requireAuth);

app.use("/api/clientes", clientesRouter);
app.use("/api/usuarios", usuariosRouter);
app.use("/api/agendamentos", agendamentosRouter);
app.use("/api/servicos", servicosRouter);
app.use("/api/ordens-servico", ordensServicoRouter);
app.use("/api/produtos", produtosRouter);

app.use(notFound);
app.use(errorHandler);