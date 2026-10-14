import { Router } from "express";
import { and, eq, ne } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  agendamentos,
  clientes,
  usuarios,
  servicos,
  ordensServico,
} from "../db/schema.js";
import { roles, validId } from "../security.js";
import { erroHttp, excluirOrdem } from "../ordemHelpers.js";

const router = Router();

// Ponto 10: o agendamento e a ordem de serviço formam um fluxo só. Cada
// agendamento nasce com a sua OS (criada na mesma transação) e esta rota
// devolve os dois juntos: dados do agendamento, nomes do cliente, técnico e
// serviço, estado da OS e informações de pagamento. A junção com a OS é
// "left" para continuar mostrando agendamentos antigos que ainda não têm OS.
// Também devolve os nomes prontos porque o técnico não tem acesso às listas
// completas de clientes e serviços.
function selecaoUnificada() {
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
      tecnicoNome: usuarios.nome,
      ordemId: ordensServico.id,
      servicoId: ordensServico.servicoId,
      servicoNome: servicos.nome,
      servicoValor: servicos.valor,
      ordemStatus: ordensServico.status,
      abertaEm: ordensServico.abertaEm,
      iniciadaEm: ordensServico.iniciadaEm,
      concluidaEm: ordensServico.concluidaEm,
      valorCobrado: ordensServico.valorCobrado,
      formaPagamento: ordensServico.formaPagamento,
      pagamentoConfirmado: ordensServico.pagamentoConfirmado,
      pagamentoConfirmadoEm: ordensServico.pagamentoConfirmadoEm,
      observacaoPagamento: ordensServico.observacaoPagamento,
    })
    .from(agendamentos)
    .innerJoin(clientes, eq(agendamentos.clienteId, clientes.id))
    .innerJoin(usuarios, eq(agendamentos.tecnicoId, usuarios.id))
    .leftJoin(
      ordensServico,
      eq(ordensServico.agendamentoId, agendamentos.id),
    )
    .leftJoin(servicos, eq(ordensServico.servicoId, servicos.id));
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

// Data de hoje no fuso do servidor (YYYY-MM-DD). Não usa toISOString porque
// ele devolve a data em UTC, que à noite já é "amanhã" no horário do Brasil.
function dataDeHoje() {
  const agora = new Date();
  const dois = (n) => String(n).padStart(2, "0");
  return `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`;
}

// Valida os dados de um atendimento (agendamento + serviço). Em uma edição,
// recebe `atual` com os valores gravados: só exige cliente/técnico/serviço
// ativos e data futura para o que de fato mudou, para não impedir a edição de
// um atendimento só porque, por exemplo, o serviço foi inativado depois.
async function validarAtendimento(executor, body, { id = null, atual = null } = {}) {
  const clienteId = Number(body.clienteId);
  const tecnicoId = Number(body.tecnicoId);
  const servicoId = Number(body.servicoId);
  const data = String(body.data || "");
  const hora = String(body.hora || "").slice(0, 5);

  if (
    !validId(clienteId) ||
    !validId(tecnicoId) ||
    !validId(servicoId) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(data) ||
    !/^\d{2}:\d{2}$/.test(hora)
  ) {
    throw erroHttp(
      "Selecione cliente, serviço, técnico, data e horário.",
      400,
    );
  }

  const dataMudou = !atual || atual.data !== data;
  const horaMudou =
    !atual || minutosDoDia(atual.hora) !== minutosDoDia(hora);

  if ((dataMudou || horaMudou) && data < dataDeHoje()) {
    throw erroHttp(
      "A data do agendamento deve ser hoje ou futura.",
      400,
    );
  }

  const [clienteRows, tecnicoRows, servicoRows, mesmoDia] =
    await Promise.all([
      executor.select().from(clientes).where(eq(clientes.id, clienteId)),
      executor
        .select()
        .from(usuarios)
        .where(
          and(
            eq(usuarios.id, tecnicoId),
            eq(usuarios.perfil, "tecnico"),
            eq(usuarios.ativo, 1),
          ),
        ),
      executor.select().from(servicos).where(eq(servicos.id, servicoId)),
      executor
        .select()
        .from(agendamentos)
        .where(
          and(
            eq(agendamentos.tecnicoId, tecnicoId),
            eq(agendamentos.data, data),
            eq(agendamentos.status, "agendado"),
            id ? ne(agendamentos.id, id) : undefined,
          ),
        ),
    ]);

  const cliente = clienteRows[0];

  if (
    !cliente ||
    (cliente.status !== "ativo" && atual?.clienteId !== clienteId)
  ) {
    throw erroHttp("Selecione um cliente ativo.", 400);
  }

  if (!tecnicoRows[0]) {
    throw erroHttp("Selecione um técnico ativo.", 400);
  }

  const servico = servicoRows[0];

  if (
    !servico ||
    (servico.ativo !== 1 && atual?.servicoId !== servicoId)
  ) {
    throw erroHttp("Selecione um serviço ativo.", 400);
  }

  // Ponto 9: o mesmo técnico precisa de no mínimo 1h entre dois
  // agendamentos no mesmo dia (não só evitar o horário exato igual).
  if (mesmoDia.some((outro) => horarioMuitoProximo(outro.hora, hora))) {
    throw erroHttp(
      "Este técnico já possui um agendamento a menos de 1h de diferença nesse horário.",
      409,
    );
  }

  return { clienteId, tecnicoId, servicoId, data, hora };
}

async function buscarUnificado(id) {
  const [linha] = await selecaoUnificada().where(eq(agendamentos.id, id));
  return linha;
}

router.get(
  "/",
  roles("ceo", "atendente", "tecnico"),
  async (req, res, next) => {
    try {
      const rows = await selecaoUnificada();

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
      const criadoId = await db.transaction(async (tx) => {
        const dados = await validarAtendimento(tx, req.body);

        const [agendamento] = await tx
          .insert(agendamentos)
          .values({
            clienteId: dados.clienteId,
            tecnicoId: dados.tecnicoId,
            data: dados.data,
            hora: dados.hora,
            status: "agendado",
          })
          .returning();

        await tx.insert(ordensServico).values({
          agendamentoId: agendamento.id,
          servicoId: dados.servicoId,
          status: "aberta",
        });

        return agendamento.id;
      });

      res.status(201).json(await buscarUnificado(criadoId));
    } catch (error) {
      next(error);
    }
  },
);

// Edição do atendimento (cliente, serviço, técnico, data e horário) enquanto
// ele ainda não foi iniciado. Para um agendamento antigo, sem OS, a edição
// também cria a OS com o serviço escolhido.
router.put(
  "/:id",
  roles("ceo", "atendente"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);

      if (!validId(id)) {
        return res.status(400).json({ error: "ID inválido." });
      }

      await db.transaction(async (tx) => {
        const [agendamento] = await tx
          .select()
          .from(agendamentos)
          .where(eq(agendamentos.id, id));

        if (!agendamento) {
          throw erroHttp("Agendamento não encontrado.", 404);
        }

        if (agendamento.status !== "agendado") {
          throw erroHttp(
            "Só é possível editar atendimentos agendados.",
            409,
          );
        }

        const [ordem] = await tx
          .select()
          .from(ordensServico)
          .where(eq(ordensServico.agendamentoId, id));

        if (ordem && ordem.status !== "aberta") {
          throw erroHttp(
            "Só é possível editar um atendimento que ainda não foi iniciado.",
            409,
          );
        }

        const dados = await validarAtendimento(tx, req.body, {
          id,
          atual: {
            clienteId: agendamento.clienteId,
            tecnicoId: agendamento.tecnicoId,
            servicoId: ordem?.servicoId ?? null,
            data: agendamento.data,
            hora: agendamento.hora,
          },
        });

        await tx
          .update(agendamentos)
          .set({
            clienteId: dados.clienteId,
            tecnicoId: dados.tecnicoId,
            data: dados.data,
            hora: dados.hora,
          })
          .where(eq(agendamentos.id, id));

        if (!ordem) {
          await tx.insert(ordensServico).values({
            agendamentoId: id,
            servicoId: dados.servicoId,
            status: "aberta",
          });
        } else if (ordem.servicoId !== dados.servicoId) {
          await tx
            .update(ordensServico)
            .set({ servicoId: dados.servicoId })
            .where(eq(ordensServico.id, ordem.id));
        }
      });

      res.json(await buscarUnificado(id));
    } catch (error) {
      next(error);
    }
  },
);

// Cancelar e registrar "atendimento não realizado" (ponto 19) são o mesmo
// encerramento, mudando só o motivo. Com a unificação, ambos são permitidos
// enquanto o atendimento não foi iniciado; a OS ainda aberta (sem peças
// debitadas) é removida junto, para não sobrar uma ordem sem agendamento.
async function encerrarSemRealizar(req, res, next, { naoRealizado }) {
  try {
    const id = Number(req.params.id);
    const motivo = String(req.body.motivo || "").trim();

    if (!validId(id)) {
      return res.status(400).json({ error: "ID inválido." });
    }

    if (naoRealizado && !motivo) {
      return res.status(400).json({
        error: "Informe o motivo do atendimento não realizado.",
      });
    }

    if (motivo.length > 255) {
      return res.status(400).json({
        error: "O motivo deve ter no máximo 255 caracteres.",
      });
    }

    await db.transaction(async (tx) => {
      const [agendamento] = await tx
        .select()
        .from(agendamentos)
        .where(eq(agendamentos.id, id));

      if (!agendamento) {
        throw erroHttp("Agendamento não encontrado.", 404);
      }

      if (
        req.usuario.perfil === "tecnico" &&
        agendamento.tecnicoId !== req.usuario.id
      ) {
        throw erroHttp("Você não pode alterar este agendamento.", 403);
      }

      if (agendamento.status !== "agendado") {
        throw erroHttp(
          naoRealizado
            ? "Apenas agendamentos em aberto podem ser marcados como não realizados."
            : "Apenas agendamentos em aberto podem ser cancelados.",
          409,
        );
      }

      const [ordem] = await tx
        .select()
        .from(ordensServico)
        .where(eq(ordensServico.agendamentoId, id));

      if (ordem && ordem.status !== "aberta") {
        throw erroHttp(
          naoRealizado
            ? "Não é possível marcar como não realizado um atendimento que já foi iniciado."
            : "Não é possível cancelar um atendimento que já foi iniciado.",
          409,
        );
      }

      if (ordem) {
        await excluirOrdem(tx, ordem.id);
      }

      await tx
        .update(agendamentos)
        .set({
          status: "cancelado",
          canceladoEm: new Date(),
          ...(naoRealizado
            ? { naoRealizado: 1, motivoNaoRealizado: motivo }
            : {}),
        })
        .where(eq(agendamentos.id, id));
    });

    res.json(await buscarUnificado(id));
  } catch (error) {
    next(error);
  }
}

router.patch(
  "/:id/cancelar",
  roles("ceo", "atendente", "tecnico"),
  (req, res, next) =>
    encerrarSemRealizar(req, res, next, { naoRealizado: false }),
);

router.patch(
  "/:id/nao-realizado",
  roles("ceo", "atendente", "tecnico"),
  (req, res, next) =>
    encerrarSemRealizar(req, res, next, { naoRealizado: true }),
);

// Exclusão definitiva do atendimento (somente CEO): remove a OS e o
// agendamento. Se a OS estava em andamento, as peças voltam ao estoque.
// Atendimentos concluídos não podem ser excluídos, para preservar o histórico
// de estoque e de pagamento.
router.delete(
  "/:id",
  roles("ceo"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);

      if (!validId(id)) {
        return res.status(400).json({ error: "ID inválido." });
      }

      await db.transaction(async (tx) => {
        const [agendamento] = await tx
          .select()
          .from(agendamentos)
          .where(eq(agendamentos.id, id));

        if (!agendamento) {
          throw erroHttp("Agendamento não encontrado.", 404);
        }

        const [ordem] = await tx
          .select()
          .from(ordensServico)
          .where(eq(ordensServico.agendamentoId, id));

        if (ordem) {
          await excluirOrdem(tx, ordem.id);
        }

        await tx.delete(agendamentos).where(eq(agendamentos.id, id));
      });

      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);

export default router;
