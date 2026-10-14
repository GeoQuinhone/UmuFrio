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

app.use(cors());
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