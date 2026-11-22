import { Router } from "express";
import {
  and,
  eq,
  sql,
} from "drizzle-orm";
import { db } from "../db/client.js";
import {
  ordensServico,
  agendamentos,
  servicos,
  servicoPecas,
  produtos,
   movimentacoesEstoque,
  clientes,
  usuarios,
  registrosLocalizacao,
} from "../db/schema.js";
import {
  roles,
  validId,
} from "../security.js";
import { erroHttp, excluirOrdem, sqlValorExtras, valorExtrasDaOrdem } from "../ordemHelpers.js";
import { notificar, avisarEstoque } from "../notificacoes.js";
import { avisarCliente } from "../whatsapp.js";

const router = Router();

// Formas de pagamento aceitas (ponto 11). Ficam em texto livre no banco, mas
// só estes valores são aceitos pela API.
export const FORMAS_PAGAMENTO = [
  "dinheiro",
  "pix",
  "cartao_debito",
  "cartao_credito",
];

// Se "true", só é possível concluir o atendimento com o pagamento confirmado.
// Por padrão não é exigido: o cliente pode pagar depois, e a tela apenas avisa.
const EXIGIR_PAGAMENTO_PARA_CONCLUIR =
  process.env.EXIGIR_PAGAMENTO_PARA_CONCLUIR === "true";

// Fase 11: início da observação quando o atendimento é concluído sem receber.
const PREFIXO_PENDENTE = "Pagamento pendente:";

function emCentavos(valor) {
  return Math.round(Number(valor) * 100);
}

// Junta a OS com o agendamento, o cliente e o serviço para já devolver os
// nomes prontos — assim o técnico (que não tem acesso às listas completas
// de clientes/serviços) também enxerga o nome do cliente e do serviço.
function selecaoComNomes() {
  return db
    .select({
      id: ordensServico.id,
      agendamentoId: ordensServico.agendamentoId,
      servicoId: ordensServico.servicoId,
      status: ordensServico.status,
      abertaEm: ordensServico.abertaEm,
      iniciadaEm: ordensServico.iniciadaEm,
      concluidaEm: ordensServico.concluidaEm,
      valorCobrado: ordensServico.valorCobrado,
      formaPagamento: ordensServico.formaPagamento,
      pagamentoConfirmado: ordensServico.pagamentoConfirmado,
      pagamentoConfirmadoEm: ordensServico.pagamentoConfirmadoEm,
      observacaoPagamento: ordensServico.observacaoPagamento,
      servicoNome: servicos.nome,
      servicoValor: servicos.valor,
      extrasValor: sqlValorExtras(ordensServico.id),
      clienteId: agendamentos.clienteId,
      clienteNome: clientes.nome,
      tecnicoId: agendamentos.tecnicoId,
      agendamentoData: agendamentos.data,
      agendamentoHora: agendamentos.hora,
    })
    .from(ordensServico)
    .innerJoin(
      agendamentos,
      eq(ordensServico.agendamentoId, agendamentos.id),
    )
    .innerJoin(
      servicos,
      eq(ordensServico.servicoId, servicos.id),
    )
    .innerJoin(
      clientes,
      eq(agendamentos.clienteId, clientes.id),
    );
}

router.get(
  "/",
  roles("ceo", "atendente", "tecnico"),
  async (req, res, next) => {
    try {
      const rows = await selecaoComNomes();

      if (req.usuario.perfil === "tecnico") {
        return res.json(
          rows.filter(
            (ordem) => ordem.tecnicoId === req.usuario.id,
          ),
        );
      }

      res.json(rows);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:id",
  roles("ceo", "atendente", "tecnico"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);

      if (!validId(id)) {
        return res.status(400).json({
          error: "ID inválido.",
        });
      }

      const rows = await selecaoComNomes().where(
        eq(ordensServico.id, id),
      );

      const ordem = rows[0];

      if (!ordem) {
        return res.status(404).json({
          error:
            "Ordem de serviço não encontrada.",
        });
      }

      if (
        req.usuario.perfil === "tecnico" &&
        ordem.tecnicoId !== req.usuario.id
      ) {
        return res.status(403).json({
          error: "Acesso negado.",
        });
      }

      res.json(ordem);
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
        agendamentoId,
        servicoId,
      } = req.body;

      const agendamentoIdNumerico =
        Number(agendamentoId);

      const servicoIdNumerico =
        Number(servicoId);

      if (
        !validId(agendamentoIdNumerico) ||
        !validId(servicoIdNumerico)
      ) {
        return res.status(400).json({
          error:
            "Selecione um agendamento e um serviço.",
        });
      }

      const ordem = await db.transaction(
        async (tx) => {
          const agendamentosEncontrados = await tx
            .select()
            .from(agendamentos)
            .where(
              eq(
                agendamentos.id,
                agendamentoIdNumerico,
              ),
            );

          const agendamento =
            agendamentosEncontrados[0];

          if (
            !agendamento ||
            agendamento.status !== "agendado"
          ) {
            const error = new Error(
              "O agendamento selecionado não está confirmado.",
            );
            error.status = 400;
            throw error;
          }

          const servicosEncontrados = await tx
            .select()
            .from(servicos)
            .where(
              eq(
                servicos.id,
                servicoIdNumerico,
              ),
            );

          if (!servicosEncontrados[0]) {
            const error = new Error(
              "Serviço não encontrado.",
            );
            error.status = 400;
            throw error;
          }

          const ordensExistentes = await tx
            .select()
            .from(ordensServico)
            .where(
              eq(
                ordensServico.agendamentoId,
                agendamentoIdNumerico,
              ),
            );

          if (ordensExistentes.length > 0) {
            const error = new Error(
              "Este agendamento já possui uma ordem de serviço.",
            );
            error.status = 409;
            throw error;
          }

          const [criada] = await tx
            .insert(ordensServico)
            .values({
              agendamentoId: agendamentoIdNumerico,
              servicoId: servicoIdNumerico,
              status: "aberta",
            })
            .returning();

          return criada;
        },
      );

      res.status(201).json(ordem);
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

      const {
        agendamentoId,
        servicoId,
      } = req.body;

      const agendamentoIdNumerico =
        Number(agendamentoId);

      const servicoIdNumerico =
        Number(servicoId);

      if (
        !validId(agendamentoIdNumerico) ||
        !validId(servicoIdNumerico)
      ) {
        return res.status(400).json({
          error:
            "Selecione um agendamento e um serviço.",
        });
      }

      const ordemAtualizada = await db.transaction(
        async (tx) => {
          const ordensEncontradas = await tx
            .select()
            .from(ordensServico)
            .where(eq(ordensServico.id, id));

          const ordem = ordensEncontradas[0];

          if (!ordem) {
            const error = new Error(
              "Ordem de serviço não encontrada.",
            );
            error.status = 404;
            throw error;
          }

          if (ordem.status !== "aberta") {
            const error = new Error(
              "Só é possível editar uma ordem de serviço enquanto ela estiver aberta (sem peças já debitadas do estoque).",
            );
            error.status = 409;
            throw error;
          }

          const agendamentosEncontrados = await tx
            .select()
            .from(agendamentos)
            .where(
              eq(
                agendamentos.id,
                agendamentoIdNumerico,
              ),
            );

          const agendamento =
            agendamentosEncontrados[0];

          if (
            !agendamento ||
            (agendamento.status !== "agendado" &&
              agendamentoIdNumerico !==
                ordem.agendamentoId)
          ) {
            const error = new Error(
              "O agendamento selecionado não está confirmado.",
            );
            error.status = 400;
            throw error;
          }

          const servicosEncontrados = await tx
            .select()
            .from(servicos)
            .where(
              eq(
                servicos.id,
                servicoIdNumerico,
              ),
            );

          if (!servicosEncontrados[0]) {
            const error = new Error(
              "Serviço não encontrado.",
            );
            error.status = 400;
            throw error;
          }

          if (
            agendamentoIdNumerico !==
            ordem.agendamentoId
          ) {
            const ordensExistentes = await tx
              .select()
              .from(ordensServico)
              .where(
                eq(
                  ordensServico.agendamentoId,
                  agendamentoIdNumerico,
                ),
              );

            if (ordensExistentes.length > 0) {
              const error = new Error(
                "Este agendamento já possui uma ordem de serviço.",
              );
              error.status = 409;
              throw error;
            }
          }

          const [atualizada] = await tx
            .update(ordensServico)
            .set({
              agendamentoId: agendamentoIdNumerico,
              servicoId: servicoIdNumerico,
            })
            .where(
              and(
                eq(ordensServico.id, id),
                eq(
                  ordensServico.status,
                  ordem.status,
                ),
              ),
            )
            .returning();

          if (!atualizada) {
            const error = new Error(
              "A ordem foi alterada. Atualize a tela e tente novamente.",
            );
            error.status = 409;
            throw error;
          }

          return atualizada;
        },
      );

      res.json(ordemAtualizada);
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

      await db.transaction(async (tx) => {
        await excluirOrdem(tx, id);
      });

      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/:id/avancar",
  roles("ceo", "atendente", "tecnico"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);

      if (!validId(id)) {
        return res.status(400).json({
          error: "ID inválido.",
        });
      }

      const produtosTocados = [];
      // Fase 11: peças que faltaram ao iniciar (o atendimento seguiu com motivo).
      let pecasEmFalta = [];

      const ordemAtualizada = await db.transaction(
        async (tx) => {
          const ordensEncontradas = await tx
            .select()
            .from(ordensServico)
            .where(eq(ordensServico.id, id));

          const ordem = ordensEncontradas[0];

          if (!ordem) {
            const error = new Error(
              "Ordem de serviço não encontrada.",
            );
            error.status = 404;
            throw error;
          }

          const agendamentosEncontrados = await tx
            .select()
            .from(agendamentos)
            .where(
              eq(
                agendamentos.id,
                ordem.agendamentoId,
              ),
            );

          const agendamento =
            agendamentosEncontrados[0];

          if (
            req.usuario.perfil === "tecnico" &&
            agendamento?.tecnicoId !== req.usuario.id
          ) {
            const error = new Error(
              "Você não pode alterar esta ordem de serviço.",
            );
            error.status = 403;
            throw error;
          }

          const proximoStatus =
            ordem.status === "aberta"
              ? "andamento"
              : ordem.status === "andamento"
                ? "concluida"
                : null;

          if (!proximoStatus) {
            const error = new Error(
              "Esta ordem de serviço já está concluída.",
            );
            error.status = 409;
            throw error;
          }

          // Ajuste final: o técnico só inicia depois do check-in (o GPS prova que ele
          // estava no endereço do cliente). Atendente e CEO podem iniciar sem, de outro
          // lugar (ex.: técnico sem internet no local).
          if (proximoStatus === "andamento" && req.usuario.perfil === "tecnico") {
            const [checkin] = await tx
              .select({ id: registrosLocalizacao.id })
              .from(registrosLocalizacao)
              .where(and(eq(registrosLocalizacao.ordemId, id), eq(registrosLocalizacao.tipo, "checkin")));
            if (!checkin) {
              throw erroHttp("Faça o check-in antes de iniciar o atendimento.", 409, { codigo: "CHECKIN_PENDENTE" });
            }
          }
          if (
            proximoStatus === "concluida" &&
            EXIGIR_PAGAMENTO_PARA_CONCLUIR &&
            !ordem.pagamentoConfirmado
          ) {
            throw erroHttp(
              "Confirme o pagamento antes de concluir o atendimento.",
              409,
            );
          }

          // Fase 11: concluir sem o pagamento confirmado exige o motivo
          // (ex.: "cliente vai pagar na empresa"). Ele fica na observação do
          // pagamento, para a empresa saber por que não foi recebido na hora.
          let observacaoPendente = ordem.observacaoPagamento;
          let valorPendente = null;

          if (proximoStatus === "concluida" && !ordem.pagamentoConfirmado) {
            const motivo = String(req.body?.motivoPagamentoPendente ?? "").trim();
            if (motivo.length < 5) {
              throw erroHttp(
                "O pagamento ainda não foi registrado. Registre o pagamento ou informe por que ele ficou pendente.",
                409,
                { codigo: "PAGAMENTO_PENDENTE" },
              );
            }
            const textoPendente = `${PREFIXO_PENDENTE} ${motivo}`;
            observacaoPendente = (
              ordem.observacaoPagamento
                ? `${textoPendente} | ${ordem.observacaoPagamento}`
                : textoPendente
            ).slice(0, 255);

            // Sem acréscimo/desconto justificado, o valor a receber é serviço +
            // peças extras (o valor gravado no início não inclui as peças).
            if (!ordem.observacaoPagamento) {
              const [servicoDaOrdem] = await tx
                .select({ valor: servicos.valor })
                .from(servicos)
                .where(eq(servicos.id, ordem.servicoId));
              const extras = await valorExtrasDaOrdem(tx, id);
              valorPendente = (Number(servicoDaOrdem?.valor ?? 0) + extras).toFixed(2);
            }
          }

          // O valor cobrado nasce igual ao valor do serviço no momento em que
          // o atendimento começa; depois pode ser ajustado em /pagamento.
          let valorCobradoInicial = valorPendente ?? ordem.valorCobrado;

          if (
            proximoStatus === "andamento" &&
            valorCobradoInicial === null
          ) {
            const [servicoDaOrdem] = await tx
              .select({ valor: servicos.valor })
              .from(servicos)
              .where(eq(servicos.id, ordem.servicoId));

            valorCobradoInicial = servicoDaOrdem?.valor ?? null;
          }

          if (proximoStatus === "andamento") {
            const pecas = await tx
              .select({
                produtoId: servicoPecas.produtoId,
                quantidade:
                  servicoPecas.quantidadeNecessaria,
                nome: produtos.nome,
                saldo: produtos.saldo,
                valorUnitario: produtos.valorUnitario,
              })
              .from(servicoPecas)
              .innerJoin(
                produtos,
                eq(
                  servicoPecas.produtoId,
                  produtos.id,
                ),
              )
              .where(
                eq(
                  servicoPecas.servicoId,
                  ordem.servicoId,
                ),
              );

            // Fase 11: faltar peça não impede o atendimento. Sem motivo, o
            // sistema avisa o que falta (para o técnico, a atendente ou o CEO
            // decidirem); com motivo (ex.: "comprei na loja X", "o saldo
            // estava errado"), inicia, baixa só o que existe e registra a falta.
            const faltando = pecas.filter((peca) => peca.saldo < peca.quantidade);
            const motivoFalta = String(req.body?.motivoFaltaPeca ?? "").trim();

            if (faltando.length && motivoFalta.length < 5) {
              const lista = faltando
                .map((peca) => `"${peca.nome}" (necessário ${peca.quantidade}, disponível ${peca.saldo})`)
                .join(", ");
              throw erroHttp(`Falta peça no estoque: ${lista}.`, 409, {
                codigo: "FALTA_PECA",
                faltando: faltando.map((peca) => ({
                  nome: peca.nome,
                  necessario: peca.quantidade,
                  saldo: peca.saldo,
                })),
              });
            }
            if (motivoFalta.length > 200) {
              throw erroHttp("O motivo pode ter no máximo 200 caracteres.", 400);
            }
            pecasEmFalta = faltando.map((peca) => ({ ...peca, motivo: motivoFalta }));

            for (const peca of pecas) {
              // Baixa só o que o estoque tem (nunca fica negativo).
              const quantidadeBaixa = Math.min(peca.quantidade, Math.max(peca.saldo, 0));
              if (quantidadeBaixa <= 0) continue;

              const [produtoAtualizado] =
                await tx
                  .update(produtos)
                  .set({
                    saldo: sql`${produtos.saldo} - ${quantidadeBaixa}`,
                  })
                  .where(
                    and(
                      eq(produtos.id, peca.produtoId),
                      sql`${produtos.saldo} >= ${quantidadeBaixa}`,
                    ),
                  )
                  .returning();

              if (!produtoAtualizado) {
                const error = new Error(
                  "O estoque foi alterado. Atualize a tela e tente novamente.",
                );
                error.status = 409;
                throw error;
              }

              produtosTocados.push(produtoAtualizado);

              await tx
                .insert(movimentacoesEstoque)
                .values({
                  produtoId: peca.produtoId,
                  usuarioId: req.usuario.id,
                  ordemServicoId: id,
                  tipo: "saida",
                  quantidade: quantidadeBaixa,
                  valorUnitario: peca.valorUnitario,
                });
            }
          }

          const [atualizada] = await tx
            .update(ordensServico)
            .set({
              status: proximoStatus,
              iniciadaEm:
                proximoStatus === "andamento"
                  ? new Date()
                  : ordem.iniciadaEm,
              concluidaEm:
                proximoStatus === "concluida"
                  ? new Date()
                  : ordem.concluidaEm,
              valorCobrado: valorCobradoInicial,
              observacaoPagamento: observacaoPendente,
            })
            .where(
              and(
                eq(ordensServico.id, id),
                eq(
                  ordensServico.status,
                  ordem.status,
                ),
              ),
            )
            .returning();

          if (!atualizada) {
            const error = new Error(
              "A ordem foi alterada. Atualize a tela e tente novamente.",
            );
            error.status = 409;
            throw error;
          }

          return atualizada;
        },
      );

            // Avisa o cliente depois de salvar: uma falha no WhatsApp não desfaz o
      // avanço do atendimento.
      const [dadosAviso] = await db
        .select({
          clienteNome: clientes.nome,
          clienteTelefone: clientes.telefone,
          servicoNome: servicos.nome,
          tecnicoNome: usuarios.nome,
        })
        .from(agendamentos)
        .innerJoin(clientes, eq(agendamentos.clienteId, clientes.id))
        .innerJoin(usuarios, eq(agendamentos.tecnicoId, usuarios.id))
        .innerJoin(servicos, eq(servicos.id, ordemAtualizada.servicoId))
        .where(eq(agendamentos.id, ordemAtualizada.agendamentoId));

      // Fase 8: notificações do CEO (nunca derrubam o avanço da ordem).
      for (const produto of produtosTocados) await avisarEstoque(produto);

      if (dadosAviso) {
        const iniciou = ordemAtualizada.status === "andamento";
        const pendente = !iniciou && !ordemAtualizada.pagamentoConfirmado;
        await notificar({
          tipo: iniciou ? "atendimento_iniciado" : "atendimento_concluido",
          agendamentoId: ordemAtualizada.agendamentoId,
          ordemId: ordemAtualizada.id,
          titulo: iniciou ? "Atendimento iniciado" : "Atendimento concluído",
          mensagem:
            `${dadosAviso.tecnicoNome} ${iniciou ? "iniciou" : "concluiu"} ` +
            `${dadosAviso.servicoNome} para ${dadosAviso.clienteNome}.` +
            (pendente ? " Pagamento pendente." : ""),
        });

        // Fase 11: o atendimento começou com falta de peça; o CEO fica sabendo
        // para corrigir o saldo (erro do estoquista) ou registrar a compra fora.
        if (pecasEmFalta.length) {
          const lista = pecasEmFalta
            .map((peca) => `${peca.nome} (faltou ${peca.quantidade - Math.max(peca.saldo, 0)})`)
            .join(", ");
          await notificar({
            tipo: "falta_peca",
            agendamentoId: ordemAtualizada.agendamentoId,
            ordemId: ordemAtualizada.id,
            titulo: "Atendimento iniciado com falta de peça",
            mensagem: `${dadosAviso.clienteNome}: ${lista}. Motivo: ${pecasEmFalta[0].motivo}`,
          });
        }
      }

      const aviso = dadosAviso
        ? await avisarCliente(
            ordemAtualizada.status === "andamento" ? "iniciado" : "concluido",
            {
              ...dadosAviso,
              horario:
                ordemAtualizada.status === "andamento"
                  ? ordemAtualizada.iniciadaEm
                  : ordemAtualizada.concluidaEm,
            },
          )
        : null;

      res.json({ ...ordemAtualizada, aviso });
    } catch (error) {
      next(error);
    }
  },
);

// Pagamento (pontos 11 e 17). Registra o valor realmente cobrado, a forma de
// pagamento, se o pagamento foi confirmado e, quando o valor difere do valor
// do serviço, o motivo. Disponível com o atendimento em andamento ou
// concluído. Depois de confirmado, só o CEO consegue alterar.
router.patch(
  "/:id/pagamento",
  roles("ceo", "atendente", "tecnico"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);

      if (!validId(id)) {
        return res.status(400).json({
          error: "ID inválido.",
        });
      }

      const valorInformado = String(
        req.body.valorCobrado ?? "",
      ).replace(",", ".");
      const valorCobrado = Number(valorInformado);

      if (
        valorInformado.trim() === "" ||
        !Number.isFinite(valorCobrado) ||
        valorCobrado < 0 ||
        valorCobrado > 99999999.99
      ) {
        return res.status(400).json({
          error: "Informe um valor cobrado válido.",
        });
      }

      const formaPagamento = req.body.formaPagamento
        ? String(req.body.formaPagamento)
        : null;

      if (
        formaPagamento !== null &&
        !FORMAS_PAGAMENTO.includes(formaPagamento)
      ) {
        return res.status(400).json({
          error: "Forma de pagamento inválida.",
        });
      }

      const confirmado = Boolean(req.body.pagamentoConfirmado);
      let textoObservacao = String(req.body.observacaoPagamento || "").trim();

      // Fase 11: com o pagamento confirmado, o "Pagamento pendente: ..." da
      // conclusão perde o sentido e sai da observação (fica o resto, se houver).
      if (confirmado && textoObservacao.startsWith(PREFIXO_PENDENTE)) {
        textoObservacao = textoObservacao.split(" | ").slice(1).join(" | ").trim();
      }

      const observacao = textoObservacao || null;

      if (observacao && observacao.length > 255) {
        return res.status(400).json({
          error:
            "A observação deve ter no máximo 255 caracteres.",
        });
      }

      if (confirmado && !formaPagamento) {
        return res.status(400).json({
          error:
            "Informe a forma de pagamento para confirmar o pagamento.",
        });
      }

      await db.transaction(async (tx) => {
        const [linha] = await tx
          .select({
            ordem: ordensServico,
            tecnicoId: agendamentos.tecnicoId,
            servicoValor: servicos.valor,
          })
          .from(ordensServico)
          .innerJoin(
            agendamentos,
            eq(ordensServico.agendamentoId, agendamentos.id),
          )
          .innerJoin(
            servicos,
            eq(ordensServico.servicoId, servicos.id),
          )
          .where(eq(ordensServico.id, id));

        if (!linha) {
          throw erroHttp("Ordem de serviço não encontrada.", 404);
        }

        const { ordem } = linha;

        if (
          req.usuario.perfil === "tecnico" &&
          linha.tecnicoId !== req.usuario.id
        ) {
          throw erroHttp(
            "Você não pode alterar esta ordem de serviço.",
            403,
          );
        }

        if (ordem.status === "aberta") {
          throw erroHttp(
            "O pagamento só pode ser registrado depois que o atendimento for iniciado.",
            409,
          );
        }

        if (
          ordem.pagamentoConfirmado &&
          req.usuario.perfil !== "ceo"
        ) {
          throw erroHttp(
            "Pagamento já confirmado. Somente o CEO pode alterá-lo.",
            403,
          );
        }

        // Fase 8: o valor esperado é o serviço + as peças extras usadas.
        const extras = await valorExtrasDaOrdem(tx, id);
        const esperado = Number(linha.servicoValor) + extras;

        if (
          emCentavos(valorCobrado) !== emCentavos(esperado) &&
          !observacao
        ) {
          throw erroHttp(
            extras > 0
              ? "O valor cobrado é diferente de serviço + peças extras. Informe o motivo na observação."
              : "O valor cobrado é diferente do valor do serviço. Informe o motivo na observação.",
            400,
          );
        }

        const jaConfirmado = Boolean(ordem.pagamentoConfirmado);

        const [atualizada] = await tx
          .update(ordensServico)
          .set({
            valorCobrado: valorCobrado.toFixed(2),
            formaPagamento,
            pagamentoConfirmado: confirmado ? 1 : 0,
            pagamentoConfirmadoEm: confirmado
              ? jaConfirmado
                ? ordem.pagamentoConfirmadoEm
                : new Date()
              : null,
            observacaoPagamento: observacao,
            pagamentoUsuarioId: req.usuario.id,
          })
          .where(
            and(
              eq(ordensServico.id, id),
              eq(ordensServico.status, ordem.status),
            ),
          )
          .returning();

        if (!atualizada) {
          throw erroHttp(
            "A ordem foi alterada. Atualize a tela e tente novamente.",
            409,
          );
        }
      });

      const [resultado] = await selecaoComNomes().where(
        eq(ordensServico.id, id),
      );

      res.json(resultado);
    } catch (error) {
      next(error);
    }
  },
);

// Peças extras (ponto 12): além das peças já vinculadas ao serviço (debitadas
// automaticamente ao avançar para "andamento"), o técnico pode precisar de
// peças adicionais durante o atendimento. Fica registrado com extra=1 para
// diferenciar do consumo padrão do serviço.
router.get(
  "/:id/pecas-extras",
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
        .select({
          id: movimentacoesEstoque.id,
          produtoId: movimentacoesEstoque.produtoId,
          produtoNome: produtos.nome,
          quantidade: movimentacoesEstoque.quantidade,
          data: movimentacoesEstoque.data,
          valorUnitario: sql`COALESCE(${movimentacoesEstoque.valorUnitario}, ${produtos.valorUnitario})`,
        })
        .from(movimentacoesEstoque)
        .innerJoin(
          produtos,
          eq(movimentacoesEstoque.produtoId, produtos.id),
        )
        .where(
          and(
            eq(movimentacoesEstoque.ordemServicoId, id),
            eq(movimentacoesEstoque.extra, 1),
          ),
        )
        .orderBy(movimentacoesEstoque.data);

      res.json(rows);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/pecas-extras",
  roles("ceo", "atendente", "tecnico"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const produtoId = Number(req.body.produtoId);
      const quantidade = Number(req.body.quantidade);

      if (
        !validId(id) ||
        !validId(produtoId) ||
        !Number.isInteger(quantidade) ||
        quantidade <= 0
      ) {
        return res.status(400).json({
          error: "Informe uma peça e uma quantidade válidas.",
        });
      }

      let produtoDepois = null;

      await db.transaction(async (tx) => {
        const ordensEncontradas = await tx
          .select()
          .from(ordensServico)
          .where(eq(ordensServico.id, id));

        const ordem = ordensEncontradas[0];

        if (!ordem) {
          const error = new Error(
            "Ordem de serviço não encontrada.",
          );
          error.status = 404;
          throw error;
        }

        if (ordem.status !== "andamento") {
          const error = new Error(
            "Só é possível descontar peças extras com a ordem em andamento.",
          );
          error.status = 409;
          throw error;
        }

        if (ordem.pagamentoConfirmado) {
          const error = new Error(
            "O pagamento já foi confirmado. Peças extras não podem mais ser adicionadas.",
          );
          error.status = 409;
          throw error;
        }

        const agendamentosEncontrados = await tx
          .select()
          .from(agendamentos)
          .where(eq(agendamentos.id, ordem.agendamentoId));

        const agendamento = agendamentosEncontrados[0];

        if (
          req.usuario.perfil === "tecnico" &&
          agendamento?.tecnicoId !== req.usuario.id
        ) {
          const error = new Error(
            "Você não pode alterar esta ordem de serviço.",
          );
          error.status = 403;
          throw error;
        }

        const pixPendente = await tx.execute(
          sql`SELECT 1 FROM cobrancas_pix WHERE ordem_id = ${id} AND status = 'pendente' LIMIT 1`,
        );

        if ((pixPendente.rows ?? pixPendente).length) {
          const error = new Error(
            "Há um PIX pendente para este atendimento. Cancele-o antes de adicionar peças extras, pois o valor muda.",
          );
          error.status = 409;
          throw error;
        }

        const produtosEncontrados = await tx
          .select()
          .from(produtos)
          .where(eq(produtos.id, produtoId));

        const produto = produtosEncontrados[0];

        if (!produto) {
          const error = new Error(
            "Produto não encontrado.",
          );
          error.status = 404;
          throw error;
        }

        if (produto.saldo < quantidade) {
          const error = new Error(
            `Estoque insuficiente de "${produto.nome}". Disponível: ${produto.saldo}.`,
          );
          error.status = 409;
          throw error;
        }

        const [produtoAtualizado] = await tx
          .update(produtos)
          .set({
            saldo: sql`${produtos.saldo} - ${quantidade}`,
          })
          .where(
            and(
              eq(produtos.id, produtoId),
              sql`${produtos.saldo} >= ${quantidade}`,
            ),
          )
          .returning();

        if (!produtoAtualizado) {
          const error = new Error(
            "O estoque foi alterado. Atualize a tela e tente novamente.",
          );
          error.status = 409;
          throw error;
        }

        await tx.insert(movimentacoesEstoque).values({
          produtoId,
          usuarioId: req.usuario.id,
          ordemServicoId: id,
          tipo: "saida",
          quantidade,
          extra: 1,
          valorUnitario: produto.valorUnitario,
        });

        // Se o valor cobrado ainda era o padrão (serviço + extras anteriores),
        // acompanha o novo total; se foi ajustado à mão, respeita o ajuste.
        const [servicoDaOrdem] = await tx
          .select({ valor: servicos.valor })
          .from(servicos)
          .where(eq(servicos.id, ordem.servicoId));
        const extrasDepois = await valorExtrasDaOrdem(tx, id);
        const extrasAntes = extrasDepois - quantidade * Number(produto.valorUnitario);
        const esperadoAntes = Number(servicoDaOrdem.valor) + extrasAntes;

        if (
          ordem.valorCobrado !== null &&
          emCentavos(ordem.valorCobrado) === emCentavos(esperadoAntes)
        ) {
          await tx
            .update(ordensServico)
            .set({
              valorCobrado: (Number(servicoDaOrdem.valor) + extrasDepois).toFixed(2),
            })
            .where(eq(ordensServico.id, id));
        }

        produtoDepois = produtoAtualizado;
      });

      // Fase 8: peça extra pode levar o estoque ao mínimo/zero -> avisa o CEO.
      if (produtoDepois) await avisarEstoque(produtoDepois);

      res.status(201).json({ sucesso: true });
    } catch (error) {
      next(error);
    }
  },
);

export default router;