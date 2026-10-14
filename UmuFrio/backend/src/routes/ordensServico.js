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
} from "../db/schema.js";
import {
  roles,
  validId,
} from "../security.js";
import { erroHttp, excluirOrdem } from "../ordemHelpers.js";

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

          // O valor cobrado nasce igual ao valor do serviço no momento em que
          // o atendimento começa; depois pode ser ajustado em /pagamento.
          let valorCobradoInicial = ordem.valorCobrado;

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

            for (const peca of pecas) {
              if (peca.saldo < peca.quantidade) {
                const error = new Error(
                  `Estoque insuficiente de "${peca.nome}". Necessário: ${peca.quantidade}. Disponível: ${peca.saldo}.`,
                );
                error.status = 409;
                throw error;
              }
            }

            for (const peca of pecas) {
              const [produtoAtualizado] =
                await tx
                  .update(produtos)
                  .set({
                    saldo: sql`${produtos.saldo} - ${peca.quantidade}`,
                  })
                  .where(
                    and(
                      eq(produtos.id, peca.produtoId),
                      sql`${produtos.saldo} >= ${peca.quantidade}`,
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

              await tx
                .insert(movimentacoesEstoque)
                .values({
                  produtoId: peca.produtoId,
                  usuarioId: req.usuario.id,
                  ordemServicoId: id,
                  tipo: "saida",
                  quantidade: peca.quantidade,
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
      const observacao =
        String(req.body.observacaoPagamento || "").trim() ||
        null;

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

        if (
          emCentavos(valorCobrado) !== emCentavos(linha.servicoValor) &&
          !observacao
        ) {
          throw erroHttp(
            "O valor cobrado é diferente do valor do serviço. Informe o motivo na observação.",
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
        });
      });

      res.status(201).json({ sucesso: true });
    } catch (error) {
      next(error);
    }
  },
);

export default router;