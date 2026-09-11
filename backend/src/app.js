import express from "express";
import cors from "cors";
import clientesRouter from "./routes/clientes.js";
import usuariosRouter from "./routes/usuarios.js";
import agendamentosRouter from "./routes/ordensServico.js";
import ordensServicoRouter from "./routes/produtos.js";
import produtosRouter from "./routes/produtos.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => res.json ({status: "ok"}));

app.use("/api/clientes", clientesRouter);
app.use("/api/usuarios", clientesRouter);
app.use("/api/agendamentos", clientesRouter);
app.use("/api/ordens-servico", clientesRouter);
app.use("/api/produtos", clientesRouter);

app.use(notFound);
app.use(errorHandler);