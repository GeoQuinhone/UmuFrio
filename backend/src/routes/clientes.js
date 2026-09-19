import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { clientes, agendamentos } from "../db/schema.js";

const router = Router();

const TIPOS_RESIDENCIA = ["casa", "apartamento", "barracao"];

function onlyDigits(s) {
  return (s || "").replace(/\D/g, "");
}

function validarEndereco(body) {
  const { cep, logradouro, numero, bairro, cidade, estado, tipoResidencia } = body;
  if (
    !onlyDigits(cep) ||
    onlyDigits(cep).length !== 8 ||
    !logradouro?.trim() ||
    !numero?.trim() ||
    !bairro?.trim() ||
    !cidade?.trim() ||
    !estado?.trim() ||
    estado.trim().length !== 2
  ) {
    return "Preencha CEP (8 dígitos), logradouro, número, bairro, cidade e estado (UF com 2 letras).";
  }
  if (!tipoResidencia || !TIPOS_RESIDENCIA.includes(tipoResidencia)) {
    return 'Informe o tipo de residência (casa, apartamento ou barracao).';
  }
  return null;
}

router.get("/", async (req, res, next) => {
  try {
    const rows = await db.select().from(clientes).orderBy(clientes.nome);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST   RF-01/RF-04, RN-01 (CPF único, só números), RN-02 (endereço completo)
router.post("/", async (req, res, next) => {
  try {
    const { nome, cpf, telefone, cep, logradouro, numero, bairro, cidade, estado, tipoResidencia, complemento } = req.body;

    if (!nome?.trim() || !cpf?.trim() || !telefone?.trim()) {
      return res.status(400).json({ error: "Preencha nome, CPF e telefone." });
    }
    if (onlyDigits(cpf).length !== 11) {
      return res.status(400).json({ error: "CPF deve ter 11 dígitos (somente números)." });
    }

    const erroEndereco = validarEndereco(req.body);
    if (erroEndereco) {
      return res.status(400).json({ error: erroEndereco });
    }

    // RN-01: não pode haver clientes com o mesmo CPF
    const existentes = await db.select().from(clientes);
    const duplicado = existentes.some((c) => onlyDigits(c.cpf) === onlyDigits(cpf));
    if (duplicado) {
      return res.status(409).json({ error: "Já existe um cliente cadastrado com este CPF." });
    }

    const [created] = await db
      .insert(clientes)
      .values({
        nome: nome.trim(),
        cpf: onlyDigits(cpf),
        telefone: telefone.trim(),
        cep: onlyDigits(cep),
        logradouro: logradouro.trim(),
        numero: numero.trim(),
        bairro: bairro.trim(),
        cidade: cidade.trim(),
        estado: estado.trim().toUpperCase(),
        tipoResidencia,
        complemento: complemento?.trim() || null,
        status: "ativo",
      })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// put (edita nome/telefone/endereço; CPF não se altera — RN-01)
router.put("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [current] = await db.select().from(clientes).where(eq(clientes.id, id));
    if (!current) return res.status(404).json({ error: "Cliente não encontrado." });

    const { nome, telefone, cep, logradouro, numero, bairro, cidade, estado, tipoResidencia, complemento } = req.body;
    if (!nome?.trim() || !telefone?.trim()) {
      return res.status(400).json({ error: "Preencha nome e telefone." });
    }

    const erroEndereco = validarEndereco(req.body);
    if (erroEndereco) {
      return res.status(400).json({ error: erroEndereco });
    }

    const [updated] = await db
      .update(clientes)
      .set({
        nome: nome.trim(),
        telefone: telefone.trim(),
        cep: onlyDigits(cep),
        logradouro: logradouro.trim(),
        numero: numero.trim(),
        bairro: bairro.trim(),
        cidade: cidade.trim(),
        estado: estado.trim().toUpperCase(),
        tipoResidencia,
        complemento: complemento?.trim() || null,
      })
      .where(eq(clientes.id, id))
      .returning();
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// PATCH   (inativar/reativar; RN-01: bloqueia se houver agendamento em aberto)
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

    const [updated] = await db
      .update(clientes)
      .set({ status: novoStatus, inativadoEm: novoStatus === "inativo" ? new Date() : null })
      .where(eq(clientes.id, id))
      .returning();
    res.json(updated);
  } catch (err) {
    next(err);
  }
});


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
