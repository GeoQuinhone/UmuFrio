import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../db/client.js"
import { clientes, agendamentos } from "../db/schema.js";

const router = Router();

function onlyDigits(s){
    return (s || "").replace(/\D/g, "");
}

// get
router.get("/", async (req, res, next) => {
    try {
        const rows = await db.select().from(clientes).orderBy(clientes.nome);
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

//post clientes com rf 01 rf 04 rn 01 rn 02
router.post("/", async (req, res, next) => {
  try {
    const { nome, cpf, telefone, endereco } = req.body;
    if (!nome?.trim() || !cpf?.trim() || !telefone?.trim() || !endereco?.trim()) {
      return res.status(400).json({ error: "Preencha todos os campos obrigatórios." });
    }
    if (onlyDigits(cpf).length !== 11) {
      return res.status(400).json({ error: "CPF deve ter 11 dígitos." });
    }

    // RN-01: não pode haver clientes com o mesmo CPF
    const existentes = await db.select().from(clientes);
    const duplicado = existentes.some((c) => onlyDigits(c.cpf) === onlyDigits(cpf));
    if (duplicado) {
      return res.status(409).json({ error: "Já existe um cliente cadastrado com este CPF." });
    }

    const [result] = await db.insert(clientes).values({ nome, cpf, telefone, endereco, status: "ativo" });
    const [created] = await db.select().from(clientes).where(eq(clientes.id, result.insertId));
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// put que edita nome/telefone/endereço CPF nao altera rn 01
router.put("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [current] = await db.select().from(clientes).where(eq(clientes.id, id));
    if (!current) return res.status(404).json({ error: "Cliente não encontrado." });

    const { nome, telefone, endereco } = req.body;
    if (!nome?.trim() || !telefone?.trim() || !endereco?.trim()) {
      return res.status(400).json({ error: "Preencha todos os campos obrigatórios." });
    }

    await db.update(clientes).set({ nome, telefone, endereco }).where(eq(clientes.id, id));
    const [updated] = await db.select().from(clientes).where(eq(clientes.id, id));
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// path inativar e reativar RN01 bloqueia se tiver agendamento em aberto
router.patch("/:id/status", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [current] = await db.select().from(clientes).where(eq(clientes.id, id));
    if (!current) return res.status(404).json({ error: "Cliente não encontrado." });

    const novoStatus = current.status === "ativo" ? "inativo" : "ativo";

    if (novoStatus === "inativo") {
      const emAberto = await db
        .select()
        .from(agendamentos)
        .where(and(eq(agendamentos.clienteId, id), eq(agendamentos.status, "agendado")));
      if (emAberto.length > 0) {
        return res.status(409).json({
          error: `Não é possível inativar "${current.nome}": há agendamento(s) em aberto para este cliente.`,
        });
      }
    }

    await db
      .update(clientes)
      .set({ status: novoStatus, inativadoEm: novoStatus === "inativo" ? new Date() : null })
      .where(eq(clientes.id, id));
    const [updated] = await db.select().from(clientes).where(eq(clientes.id, id));
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// delete
router.delete("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await db.delete(clientes).where(eq(clientes.id, id));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;