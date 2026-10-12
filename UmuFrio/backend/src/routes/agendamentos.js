import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  agendamentos,
  clientes,
  usuarios,
  ordensServico,
} from "../db/schema.js";
import { roles, validId } from "../security.js";

const router = Router();

// Junta o agendamento com o cliente para já devolver o nome e o contato —
// o técnico não tem acesso à lista completa de clientes, então sem isso
// ele veria só o ID ("Cliente #3") em vez do nome.
function selecaoComCliente() {
  return db
    .select({
      id: agendamentos.id,
      clienteId: agendamentos.clienteId,
      tecnicoId: agendamentos.tecnicoId,
      data: agendamentos.data,
      hora: agendamentos.hora,
      status: agendamentos.status,
      canceladoEm: agendamentos.canceladoEm,
      naoRealizado: agendamentos.naoRealizado,
      motivoNaoRealizado: agendamentos.motivoNaoRealizado,
      clienteNome: clientes.nome,
      clienteTelefone: clientes.telefone,
      clienteLogradouro: clientes.logradouro,
      clienteNumero: clientes.numero,
      clienteBairro: clientes.bairro,
      clienteCidade: clientes.cidade,
      clienteEstado: clientes.estado,
    })
    .from(agendamentos)
    .innerJoin(
      clientes,
      eq(agendamentos.clienteId, clientes.id),
    );
}

// Converte "HH:MM" ou "HH:MM:SS" em minutos desde a meia-noite, para checar
// a distância entre dois horários do mesmo técnico (ponto 9: mínimo de 1h).
function minutosDoDia(hora) {
  const [h, m] = String(hora || "").split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function horarioMuitoProximo(horaA, horaB) {
  return Math.abs(minutosDoDia(horaA) - minutosDoDia(horaB)) < 60;
}

router.get(
  "/",
  roles("ceo", "atendente", "tecnico"),
  async (req, res, next) => {
    try {
      const rows = await selecaoComCliente();

      if (req.usuario.perfil === "tecnico") {
        return res.json(
          rows.filter(
            (agendamento) =>
              agendamento.tecnicoId === req.usuario.id,
          ),
        );
      }

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
      const {
        clienteId,
        tecnicoId,
        data,
        hora,
      } = req.body;

      const clienteIdNumerico = Number(clienteId);
      const tecnicoIdNumerico = Number(tecnicoId);

      if (
        !validId(clienteIdNumerico) ||
        !validId(tecnicoIdNumerico) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(data || "") ||
        !/^\d{2}:\d{2}/.test(hora || "")
      ) {
        return res.status(400).json({
          error:
            "Selecione cliente, técnico, data e horário.",
        });
      }

      const hoje = new Date()
        .toISOString()
        .slice(0, 10);

      if (data < hoje) {
        return res.status(400).json({
          error:
            "A data do agendamento deve ser hoje ou futura.",
        });
      }

      const [clienteRows, tecnicoRows, conflitos] =
        await Promise.all([
          db
            .select()
            .from(clientes)
            .where(eq(clientes.id, clienteIdNumerico)),

          db
            .select()
            .from(usuarios)
            .where(
              and(
                eq(usuarios.id, tecnicoIdNumerico),
                eq(usuarios.perfil, "tecnico"),
                eq(usuarios.ativo, 1),
              ),
            ),

          db
            .select()
            .from(agendamentos)
            .where(
              and(
                eq(
                  agendamentos.tecnicoId,
                  tecnicoIdNumerico,
                ),
                eq(agendamentos.data, data),
                eq(
                  agendamentos.status,
                  "agendado",
                ),
              ),
            ),
        ]);

      const cliente = clienteRows[0];
      const tecnico = tecnicoRows[0];

      if (!cliente || cliente.status !== "ativo") {
        return res.status(400).json({
          error: "Selecione um cliente ativo.",
        });
      }

      if (!tecnico) {
        return res.status(400).json({
          error: "Selecione um técnico ativo.",
        });
      }

      // Ponto 9: o mesmo técnico precisa de no mínimo 1h de intervalo entre
      // dois agendamentos no mesmo dia (não só evitar o horário exato igual).
      const conflito = conflitos.some((agendamento) =>
        horarioMuitoProximo(agendamento.hora, hora),
      );

      if (conflito) {
        return res.status(409).json({
          error:
            "Este técnico já possui um agendamento a menos de 1h de diferença nesse horário.",
        });
      }

      const [agendamento] = await db
        .insert(agendamentos)
        .values({
          clienteId: clienteIdNumerico,
          tecnicoId: tecnicoIdNumerico,
          data,
          hora,
          status: "agendado",
        })
        .returning();

      res.status(201).json(agendamento);
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/:id/cancelar",
  roles("ceo", "atendente", "tecnico"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);

      if (!validId(id)) {
        return res.status(400).json({
          error: "ID inválido.",
        });
      }

      const rows = await db
        .select()
        .from(agendamentos)
        .where(eq(agendamentos.id, id));

      const agendamento = rows[0];

      if (!agendamento) {
        return res.status(404).json({
          error: "Agendamento não encontrado.",
        });
      }

      if (
        req.usuario.perfil === "tecnico" &&
        agendamento.tecnicoId !== req.usuario.id
      ) {
        return res.status(403).json({
          error: "Você não pode cancelar este agendamento.",
        });
      }

      if (agendamento.status !== "agendado") {
        return res.status(409).json({
          error:
            "Apenas agendamentos em aberto podem ser cancelados.",
        });
      }

      const ordemExistente = await db
        .select()
        .from(ordensServico)
        .where(
          eq(
            ordensServico.agendamentoId,
            id,
          ),
        );

      if (ordemExistente.length > 0) {
        return res.status(409).json({
          error:
            "Não é possível cancelar um agendamento que já possui ordem de serviço.",
        });
      }

      const [atualizado] = await db
        .update(agendamentos)
        .set({
          status: "cancelado",
          canceladoEm: new Date(),
        })
        .where(eq(agendamentos.id, id))
        .returning();

      res.json(atualizado);
    } catch (error) {
      next(error);
    }
  },
);

// Ponto 19: registrar que o atendimento não pôde ser realizado (cliente
// ausente, local fechado, etc.), com motivo obrigatório para histórico.
router.patch(
  "/:id/nao-realizado",
  roles("ceo", "atendente", "tecnico"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const motivo = String(req.body.motivo || "").trim();

      if (!validId(id)) {
        return res.status(400).json({
          error: "ID inválido.",
        });
      }

      if (!motivo) {
        return res.status(400).json({
          error: "Informe o motivo do atendimento não realizado.",
        });
      }

      const rows = await db
        .select()
        .from(agendamentos)
        .where(eq(agendamentos.id, id));

      const agendamento = rows[0];

      if (!agendamento) {
        return res.status(404).json({
          error: "Agendamento não encontrado.",
        });
      }

      if (
        req.usuario.perfil === "tecnico" &&
        agendamento.tecnicoId !== req.usuario.id
      ) {
        return res.status(403).json({
          error: "Você não pode alterar este agendamento.",
        });
      }

      if (agendamento.status !== "agendado") {
        return res.status(409).json({
          error:
            "Apenas agendamentos em aberto podem ser marcados como não realizados.",
        });
      }

      const ordemExistente = await db
        .select()
        .from(ordensServico)
        .where(eq(ordensServico.agendamentoId, id));

      if (ordemExistente.length > 0) {
        return res.status(409).json({
          error:
            "Não é possível marcar como não realizado um agendamento que já possui ordem de serviço.",
        });
      }

      const [atualizado] = await db
        .update(agendamentos)
        .set({
          status: "cancelado",
          canceladoEm: new Date(),
          naoRealizado: 1,
          motivoNaoRealizado: motivo,
        })
        .where(eq(agendamentos.id, id))
        .returning();

      res.json(atualizado);
    } catch (error) {
      next(error);
    }
  },
);

export default router;