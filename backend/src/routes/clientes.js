import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { clientes, agendamentos } from "../db/schema.js";
import { onlyDigits, roles, validId } from "../security.js";

const router = Router();

const TIPOS_RESIDENCIA = [
  "casa",
  "apartamento",
  "barracao",
];

function validarCliente(body) {
  if (
    !body.nome?.trim() ||
    !body.telefone?.trim() ||
    onlyDigits(body.cpf).length !== 11
  ) {
    return "Preencha nome, CPF com 11 dígitos e telefone.";
  }

  if (
    onlyDigits(body.cep).length !== 8 ||
    !body.logradouro?.trim() ||
    !body.numero?.trim() ||
    !body.bairro?.trim() ||
    !body.cidade?.trim() ||
    !/^[A-Za-z]{2}$/.test(body.estado || "") ||
    !TIPOS_RESIDENCIA.includes(body.tipoResidencia)
  ) {
    return "Preencha corretamente o endereço e o tipo de residência.";
  }

  return null;
}

router.get(
  "/",
  roles("ceo", "atendente"),
  async (_req, res, next) => {
    try {
      const rows = await db
        .select()
        .from(clientes)
        .orderBy(clientes.nome);

      res.json(rows);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/",
  roles("ceo", "atendente"),
  async (req, res, next) => {
    try {
      const error = validarCliente(req.body);

      if (error) {
        return res.status(400).json({ error });
      }

      const dados = {
        nome: req.body.nome.trim(),
        cpf: onlyDigits(req.body.cpf),
        telefone: req.body.telefone.trim(),
        cep: onlyDigits(req.body.cep),
        logradouro: req.body.logradouro.trim(),
        numero: req.body.numero.trim(),
        complemento: req.body.complemento?.trim() || null,
        bairro: req.body.bairro.trim(),
        cidade: req.body.cidade.trim(),
        estado: req.body.estado.trim().toUpperCase(),
        tipoResidencia: req.body.tipoResidencia,
        status: "ativo",
      };

      const [cliente] = await db
        .insert(clientes)
        .values(dados)
        .returning();

      res.status(201).json(cliente);
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  "/:id",
  roles("ceo", "atendente"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);

      if (!validId(id)) {
        return res.status(400).json({
          error: "ID inválido.",
        });
      }

      const clienteAtual = await db
        .select()
        .from(clientes)
        .where(eq(clientes.id, id));

      const cliente = clienteAtual[0];

      if (!cliente) {
        return res.status(404).json({
          error: "Cliente não encontrado.",
        });
      }

      const error = validarCliente({
        ...req.body,
        cpf: req.body.cpf || cliente.cpf,
      });

      if (error) {
        return res.status(400).json({ error });
      }

      const [atualizado] = await db
        .update(clientes)
        .set({
          nome: req.body.nome.trim(),
          telefone: req.body.telefone.trim(),
          cep: onlyDigits(req.body.cep),
          logradouro: req.body.logradouro.trim(),
          numero: req.body.numero.trim(),
          complemento: req.body.complemento?.trim() || null,
          bairro: req.body.bairro.trim(),
          cidade: req.body.cidade.trim(),
          estado: req.body.estado.trim().toUpperCase(),
          tipoResidencia: req.body.tipoResidencia,
        })
        .where(eq(clientes.id, id))
        .returning();

      res.json(atualizado);
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/:id/status",
  roles("ceo", "atendente"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);

      if (!validId(id)) {
        return res.status(400).json({
          error: "ID inválido.",
        });
      }

      const clienteAtual = await db
        .select()
        .from(clientes)
        .where(eq(clientes.id, id));

      const cliente = clienteAtual[0];

      if (!cliente) {
        return res.status(404).json({
          error: "Cliente não encontrado.",
        });
      }

      if (cliente.status === "ativo") {
        const agendamentosAbertos = await db
          .select()
          .from(agendamentos)
          .where(
            and(
              eq(agendamentos.clienteId, id),
              eq(agendamentos.status, "agendado"),
            ),
          );

        if (agendamentosAbertos.length > 0) {
          return res.status(409).json({
            error:
              "Não é possível inativar o cliente porque existem agendamentos em aberto.",
          });
        }
      }

      const novoStatus =
        cliente.status === "ativo"
          ? "inativo"
          : "ativo";

      const [atualizado] = await db
        .update(clientes)
        .set({
          status: novoStatus,
          inativadoEm:
            novoStatus === "inativo"
              ? new Date()
              : null,
        })
        .where(eq(clientes.id, id))
        .returning();

      res.json(atualizado);
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  "/:id",
  roles("ceo"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);

      if (!validId(id)) {
        return res.status(400).json({
          error: "ID inválido.",
        });
      }

      await db
        .delete(clientes)
        .where(eq(clientes.id, id));

      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);

export default router;