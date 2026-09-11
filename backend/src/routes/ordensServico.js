import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { ordensServico, agendamentos } from "../db/schema.js";

const router = Router();

const STATUS_FLOW = ["aberta", "andamento", "concluida"];

// get 
router.get("/", async (req, res, next) => {
  try {
    const rows = await db.select().from(ordensServico);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// post RN01 só depois de agendamento confirmado 1 OS por agendamento
router.post("/", async (req, res, next) => {
  try {
    const { agendamentoId } = req.body;
    if (!agendamentoId) {
      return res.status(400).json({ error: "Selecione um agendamento confirmado." });
    }

    const [agendamento] = await db.select().from(agendamentos).where(eq(agendamentos.id, agendamentoId));
    if (!agendamento || agendamento.status !== "agendado") {
      return res.status(400).json({ error: "O agendamento selecionado não está confirmado." });
    }

    const existentes = await db.select().from(ordensServico).where(eq(ordensServico.agendamentoId, agendamentoId));
    if (existentes.length > 0) {
      return res.status(409).json({ error: "Este agendamento já possui uma ordem de serviço." });
    }

    const [result] = await db.insert(ordensServico).values({ agendamentoId, status: "aberta" });
    const [created] = await db.select().from(ordensServico).where(eq(ordensServico.id, result.insertId));
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

//patch RN02 status só avança nunca volta pra trás
router.patch("/:id/avancar", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [current] = await db.select().from(ordensServico).where(eq(ordensServico.id, id));
    if (!current) return res.status(404).json({ error: "Ordem de serviço não encontrada." });

    const idx = STATUS_FLOW.indexOf(current.status);
    if (idx === STATUS_FLOW.length - 1) {
      return res.status(409).json({ error: "Esta ordem de serviço já está concluída." });
    }
    const proximo = STATUS_FLOW[idx + 1];

    await db
      .update(ordensServico)
      .set({ status: proximo, concluidaEm: proximo === "concluida" ? new Date() : current.concluidaEm })
      .where(eq(ordensServico.id, id));
    const [updated] = await db.select().from(ordensServico).where(eq(ordensServico.id, id));
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;