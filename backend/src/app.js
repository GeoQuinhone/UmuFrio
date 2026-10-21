import express from "express";
import cors from "cors";

import authRouter from "./routes/auth.js";
import clientesRouter from "./routes/clientes.js";
import usuariosRouter from "./routes/usuarios.js";
import agendamentosRouter from "./routes/agendamentos.js";
import servicosRouter from "./routes/servicos.js";
import ordensServicoRouter from "./routes/ordensServico.js";
import produtosRouter from "./routes/produtos.js";
import pixRouter, { webhookRouter as pixWebhookRouter } from "./routes/pix.js";
import relatoriosRouter from "./routes/relatorios.js";
import checkinRouter from "./routes/checkin.js";
import chatRouter from "./routes/chat.js";

import { requireAuth } from "./security.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);

// Aviso automático do Mercado Pago: público (não leva o nosso token); a rota
// valida a assinatura e consulta o pagamento direto na API do Mercado Pago.
app.use("/api/pix/webhook", pixWebhookRouter);

// Chat de atendimento da tela inicial (antes do login): público, com limite de
// uso e sem dados de clientes.
app.use("/api/chat", chatRouter);

app.use(requireAuth);

app.use("/api/clientes", clientesRouter);
app.use("/api/usuarios", usuariosRouter);
app.use("/api/agendamentos", agendamentosRouter);
app.use("/api/servicos", servicosRouter);
app.use("/api/ordens-servico", ordensServicoRouter);
app.use("/api/ordens-servico", pixRouter);
app.use("/api/ordens-servico", checkinRouter);
app.use("/api/produtos", produtosRouter);
app.use("/api/relatorios", relatoriosRouter);

app.use(notFound);
app.use(errorHandler);