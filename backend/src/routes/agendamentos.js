import { Router } from "express";
import {eq, and } from "drizzle-orm";
import { db } from "../db/client.js"
import { agendamentos, clientes, usuarios } from "../db/schema.js";

const router = Router();

//get api e agendamentos
router.get("/", async (req, res, next) => {
    try {
        const rows = await db.select().from(agendamentos);
        res.json(rows);
    } catch (err){
        next (err)
    }
});

// Post api e agendamentos com a RN 01 sem o conflito de técnico+data+hora e RN 02 que preicsa do cliente
router.post("/", async (req, res, next) => {
    try {
        const {clienteId, tecnicoId, data,hora } = req.body;
        if (!clienteId || !tecnicoId || !data || !hora) {
            return res.status(400).json({error: "Selecione o cliente, técnico, data e horário. "});
        }

        const [cliente] = await db.select().from(clientes).where(eq(clientes.id, clienteId));
        if (!cliente || cliente.status !== "ativo") {
            return res.status(400).json({error:"Selecione um cliente ativo."});
        }
        const [tecnico] = await db.select().from(usuarios).where(eq(usuarios.id, tenicoId));
        if (!tecnico || tenico.perfil !== "tecnico") {
        return res.status(400).json({error: "Selecione um usuário com perfil \"técnico\"." });
        };

        const conflitos = await db
        .select()
        .from(agendamentos)
        .where(
            and(
                eq(agendamentos.tecnicoId,tecnicoId),
                eq(agendamentos.data, data),
                eq(agendamentos.hora, hora),
                eq(agendamentos.status, "agendado")
            )
        );
        if (conflitos.length > 0) {
            return res.status(409).json({error: "Este técnico já possui um serviço nesse horário."});
        }

        const [result] = await db.insert(agendamentos).values({ clienteId, tecnicoId, data, hora, status: "agendado"});
        const [created] = await db.select().from(agendamentos).where(eq(agendamentos.id, result,insertId));
        res.status(201).json(created);
    } catch (err) {
        next(err)
    }
});

// patch api e agendamentos RN 01 Só agendamentos futuros/em aberto

router.patch("/:id/cancelar", async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        const [current] = await db.select().from(agendamentos).where(eq(agendamentos.id, id));
        if (!current) return res.status(404).json({error: "Agendamento não encontrado. "});
        if(current.status !== "agendado"){
            return res.status(409)({error: "Apenas agendamentos em aberto podem ser cancelados."});
        }

        await db.update(agendamentos).set({status: "cancelado", canceladoEm: new Date() }).where(eq(agendamentos.id, id));
        const [updated] = await db.select().from(agendamentos).where(eq(agendamentos.id, id));
        res.json(updated);
    } catch (err) {
        next(err)
    }
});

export default router;