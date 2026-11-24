// Rotas de agendamentos (/api/agendamentos): cada agendamento nasce junto com a sua ordem de serviço (OS).
// Inclui listar, criar, editar, cancelar, marcar como "não realizado" e excluir.
import { Router } from "express";
import { and, eq, ne } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  agendamentos,
  clientes,
  usuarios,
  servicos,
  ordensServico,
  veiculos,
} from "../db/schema.js";
import { roles, validId } from "../security.js";
import { erroHttp, excluirOrdem, sqlPecasFaltando, sqlValorExtras } from "../ordemHelpers.js";
import { notificar } from "../notificacoes.js";
import { avisarCliente } from "../whatsapp.js";

// Cria o roteador deste módulo.
const router = Router();

// Ponto 10: o agendamento e a ordem de serviço formam um fluxo só. Cada
// agendamento nasce com a sua OS (criada na mesma transação) e esta rota
// devolve os dois juntos: dados do agendamento, nomes do cliente, técnico e
// serviço, estado da OS e informações de pagamento. A junção com a OS é
// "left" para continuar mostrando agendamentos antigos que ainda não têm OS.
// Também devolve os nomes prontos porque o técnico não tem acesso às listas
// completas de clientes e serviços. O veículo é o que está ativo sob
// responsabilidade do técnico (no máximo um por técnico).

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
      veiculoPlaca: veiculos.placa,
      veiculoMarca: veiculos.marca,
      veiculoModelo: veiculos.modelo,
      ordemId: ordensServico.id,
      servicoId: ordensServico.servicoId,
      servicoNome: servicos.nome,
      servicoValor: servicos.valor,
      extrasValor: sqlValorExtras(ordensServico.id),
      // Fase 11: peças que faltam no estoque para este atendimento (aviso antecipado).
      pecasFaltando: sqlPecasFaltando(ordensServico.servicoId, ordensServico.status),
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
    .leftJoin(veiculos, and(
        eq(veiculos.tecnicoId, agendamentos.tecnicoId),
        eq(veiculos.status, "ativo"),
      ),
    )
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

// Expediente: só é possível agendar das 07:00 às 19:00 (inclusive).
const EXPEDIENTE_INICIO = 7 * 60;
const EXPEDIENTE_FIM = 19 * 60;

// Diz se dois horários estão a menos de 1 hora de distância (regra: mínimo de 1h entre atendimentos do mesmo técnico).
function horarioMuitoProximo(horaA, horaB) {
  return Math.abs(minutosDoDia(horaA) - minutosDoDia(horaB)) < 60;
}

// Ajuste final: minutos do dia de agora no fuso de Brasília (ex.: 12:32 = 752).
function minutosAgora() {
  const [h, m] = new Intl.DateTimeFormat("en-GB", {
    timeZone: process.env.RELATORIOS_FUSO || "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date())
    .split(":")
    .map(Number);
  return h * 60 + m;
}

// Data de hoje no fuso de Brasília (YYYY-MM-DD), independente do fuso do
// servidor: o Render roda em UTC e, depois das 21h, a data UTC já é "amanhã".
function dataDeHoje() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.RELATORIOS_FUSO || "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Valida os dados de um atendimento (agendamento + serviço). Em uma edição,
// recebe `atual` com os valores gravados: só exige cliente/técnico/serviço
// ativos e data futura para o que de fato mudou, para não impedir a edição de
// um atendimento só porque, por exemplo, o serviço foi inativado depois.
async function validarAtendimento(executor, body, { id = null, atual = null } = {}) {
  // Lê e limpa os dados enviados; se faltar algum, responde 400.
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

  // Só valida "data futura" quando a data ou o horário foram alterados (permite editar um atendimento antigo).
  const dataMudou = !atual || atual.data !== data;
  const horaMudou =
    !atual || minutosDoDia(atual.hora) !== minutosDoDia(hora);

  if ((dataMudou || horaMudou) && data < dataDeHoje()) {
    throw erroHttp(
      "A data do agendamento deve ser hoje ou futura.",
      400,
    );
  }
  // Ajuste final: hoje, só a partir do horário atual (Brasília). Ninguém lança
  // atendimento no passado; vale ao criar ou ao mudar a data ou o horário.
  if ((dataMudou || horaMudou) && data === dataDeHoje() && minutosDoDia(hora) < minutosAgora()) {
    throw erroHttp(
      "Este horário já passou. Escolha um horário a partir de agora.",
      400,
    );
  }

  // Trava do expediente: o horário precisa estar entre 07:00 e 19:00 (valida ao criar ou quando o horário é alterado).
  if (horaMudou) {
    const minutos = minutosDoDia(hora);
    if (minutos < EXPEDIENTE_INICIO || minutos > EXPEDIENTE_FIM) {
      throw erroHttp(
        "O horário do agendamento deve ser entre 07:00 e 19:00.",
        400,
      );
    }
  }

  // Busca, ao mesmo tempo, o cliente, o técnico, o serviço e os outros agendamentos do técnico no mesmo dia.
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
        .select({ hora: agendamentos.hora, ordemStatus: ordensServico.status })
        .from(agendamentos)
        .leftJoin(ordensServico, eq(ordensServico.agendamentoId, agendamentos.id))
        .where(
          and(
            eq(agendamentos.tecnicoId, tecnicoId),
            eq(agendamentos.data, data),
            eq(agendamentos.status, "agendado"),
            id ? ne(agendamentos.id, id) : undefined,
          ),
        ),
    ]);

  // Confere se o cliente existe e está ativo.
  const cliente = clienteRows[0];

  if (
    !cliente ||
    (cliente.status !== "ativo" && atual?.clienteId !== clienteId)
  ) {
    throw erroHttp("Selecione um cliente ativo.", 400);
  }

  // Confere se o técnico existe, é técnico e está ativo.
  if (!tecnicoRows[0]) {
    throw erroHttp("Selecione um técnico ativo.", 400);
  }

  // Confere se o serviço existe e está ativo.
  const servico = servicoRows[0];

  if (
    !servico ||
    (servico.ativo !== 1 && atual?.servicoId !== servicoId)
  ) {
    throw erroHttp("Selecione um serviço ativo.", 400);
  }

  // Ponto 9: o mesmo técnico precisa de no mínimo 1h entre dois
  // agendamentos no mesmo dia (não só evitar o horário exato igual).
  // Ajuste final: atendimento já concluído libera o horário (o técnico que
  // adianta abre espaço na agenda); só o horário exato continua ocupado.
  if (
    mesmoDia.some((outro) =>
      outro.ordemStatus === "concluida"
        ? minutosDoDia(outro.hora) === minutosDoDia(hora)
        : horarioMuitoProximo(outro.hora, hora),
    )
  ) {
    throw erroHttp(
      "Este técnico já possui um agendamento a menos de 1h de diferença nesse horário.",
      409,
    );
  }

  // Dados já validados e prontos para gravar.
  return { clienteId, tecnicoId, servicoId, data, hora };
}

// Busca um agendamento já com a OS, cliente, técnico e serviço juntos.
async function buscarUnificado(id) {
  const [linha] = await selecaoUnificada().where(eq(agendamentos.id, id));
  return linha;
}

// GET /api/agendamentos — lista os agendamentos; o técnico vê só os dele.
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

// POST /api/agendamentos — cria o agendamento e a OS na mesma transação (ou grava os dois, ou nenhum).
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

      // Tudo numa transação: confere o agendamento, a OS e grava as mudanças juntas.
      await db.transaction(async (tx) => {
        const [agendamento] = await tx
          .select()
          .from(agendamentos)
          .where(eq(agendamentos.id, id));

        // Agendamento inexistente: 404.
        if (!agendamento) {
          throw erroHttp("Agendamento não encontrado.", 404);
        }

        // Só dá para editar agendamento que ainda está "agendado" (não cancelado).
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

        // Só dá para editar enquanto a OS está "aberta" (antes de iniciar o atendimento).
        if (ordem && ordem.status !== "aberta") {
          throw erroHttp(
            "Só é possível editar um atendimento que ainda não foi iniciado.",
            409,
          );
        }

        // Valida os novos dados do atendimento, ignorando o próprio agendamento na checagem de horário.
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

        // Agendamento antigo sem OS: cria a OS; se já existe e o serviço mudou, atualiza o serviço da OS.
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

    // Para "não realizado", o motivo é obrigatório.
    if (naoRealizado && !motivo) {
      return res.status(400).json({
        error: "Informe o motivo do atendimento não realizado.",
      });
    }

    // O motivo pode ter no máximo 255 caracteres.
    if (motivo.length > 255) {
      return res.status(400).json({
        error: "O motivo deve ter no máximo 255 caracteres.",
      });
    }

    // Guarda o serviço antes de encerrar: a OS aberta é removida junto, e o
    // aviso de "não realizado" ao cliente precisa do nome do serviço.
    const antes = await buscarUnificado(id);

    // Em transação: confere a situação do agendamento e da OS e faz o encerramento.
    await db.transaction(async (tx) => {
      const [agendamento] = await tx
        .select()
        .from(agendamentos)
        .where(eq(agendamentos.id, id));

      // Agendamento inexistente: 404.
      if (!agendamento) {
        throw erroHttp("Agendamento não encontrado.", 404);
      }

      if (
        req.usuario.perfil === "tecnico" &&
        agendamento.tecnicoId !== req.usuario.id
      ) {
        throw erroHttp("Você não pode alterar este agendamento.", 403);
      }

      // Só encerra agendamento que ainda está "agendado".
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

      // Se o atendimento já foi iniciado, não pode mais ser cancelado.
      if (ordem && ordem.status !== "aberta") {
        throw erroHttp(
          naoRealizado
            ? "Não é possível marcar como não realizado um atendimento que já foi iniciado."
            : "Não é possível cancelar um atendimento que já foi iniciado.",
          409,
        );
      }

      // Remove a OS aberta junto, para não sobrar uma ordem sem agendamento.
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

    const resultado = await buscarUnificado(id);

    // Fase 8: avisa o CEO (quem cancelou, quem registrou o não realizado).
    if (resultado) {
      await notificar({
        tipo: naoRealizado ? "nao_realizado" : "cancelado",
        agendamentoId: id,
        titulo: naoRealizado ? "Atendimento não realizado" : "Atendimento cancelado",
        mensagem:
          `${resultado.clienteNome} – ${resultado.data}` +
          `${resultado.hora ? ` ${String(resultado.hora).slice(0, 5)}` : ""}` +
          `${naoRealizado ? `: ${motivo}` : "."}`,
      });
    }

    // Avisa o cliente pelo WhatsApp que o técnico esteve no local e não foi
    // possível atender. O motivo digitado fica só no sistema (é interno).
    // Uma falha no WhatsApp não desfaz o registro.
    const aviso =
      naoRealizado && antes
        ? await avisarCliente("nao_realizado", {
            clienteNome: antes.clienteNome,
            clienteTelefone: antes.clienteTelefone,
            servicoNome: antes.servicoNome || "manutenção",
            tecnicoNome: antes.tecnicoNome,
            horario: new Date(),
          })
        : null;

    res.json({ ...resultado, aviso });
  } catch (error) {
    next(error);
  }
}

// PATCH /api/agendamentos/:id/cancelar — cancela o agendamento (CEO, atendente ou técnico).
router.patch(
  "/:id/cancelar",
  roles("ceo", "atendente", "tecnico"),
  (req, res, next) =>
    encerrarSemRealizar(req, res, next, { naoRealizado: false }),
);

// PATCH /api/agendamentos/:id/nao-realizado — registra que o atendimento não aconteceu, com motivo.
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

      // Em transação: remove a OS (devolvendo peças ao estoque, se estava em andamento) e depois o agendamento.
      await db.transaction(async (tx) => {
        const [agendamento] = await tx
          .select()
          .from(agendamentos)
          .where(eq(agendamentos.id, id));

        // Agendamento inexistente: 404.
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

// Exporta o roteador para o app.js.
export default router;
