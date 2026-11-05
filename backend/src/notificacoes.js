import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "./db/client.js";
import { notificacoes } from "./db/schema.js";
import { situacaoEstoque } from "./estoqueRegras.js";

export { situacaoEstoque };

// Fase 8 — notificações do CEO (sino do topo da tela).
//
// Tipos gravados: estoque_baixo, estoque_zerado, atendimento_iniciado,
// atendimento_concluido (com aviso de pagamento pendente quando for o caso),
// nao_realizado e cancelado. Falhas aqui NUNCA podem derrubar a operação que
// gerou o aviso, por isso tudo é chamado depois da transação e com try/catch.

export const TIPOS_NOTIFICACAO = [
  "estoque_baixo",
  "estoque_zerado",
  "atendimento_iniciado",
  "atendimento_concluido",
  "nao_realizado",
  "cancelado",
];

export async function notificar(dados) {
  try {
    await db.insert(notificacoes).values({
      tipo: dados.tipo,
      titulo: String(dados.titulo).slice(0, 120),
      mensagem: String(dados.mensagem).slice(0, 300),
      agendamentoId: dados.agendamentoId ?? null,
      ordemId: dados.ordemId ?? null,
      produtoId: dados.produtoId ?? null,
    });
  } catch (erro) {
    console.error("Falha ao registrar notificação:", erro.message);
  }
}

// Avisa o CEO quando um produto chega ao mínimo ou zera. Para não repetir o
// mesmo aviso a cada saída, só cria outro se não existir um aviso igual ainda
// não lido para o produto.
export async function avisarEstoque(produto) {
  try {
    const situacao = situacaoEstoque(produto);
    if (situacao === "ok") return;

    const tipo = situacao === "zerado" ? "estoque_zerado" : "estoque_baixo";
    const [existente] = await db
      .select({ id: notificacoes.id })
      .from(notificacoes)
      .where(
        and(
          eq(notificacoes.produtoId, produto.id),
          eq(notificacoes.tipo, tipo),
          isNull(notificacoes.lidaEm),
        ),
      )
      .limit(1);
    if (existente) return;

    await notificar({
      tipo,
      produtoId: produto.id,
      titulo: situacao === "zerado" ? "Estoque zerado" : "Estoque no mínimo",
      mensagem:
        situacao === "zerado"
          ? `${produto.nome} acabou (saldo 0). Reponha o estoque.`
          : `${produto.nome} está com ${produto.saldo} un. (mínimo ${produto.quantidadeMinima}).`,
    });
  } catch (erro) {
    console.error("Falha ao avaliar estoque:", erro.message);
  }
}

export async function listarNotificacoes(limite = 40) {
  const itens = await db
    .select()
    .from(notificacoes)
    .orderBy(desc(notificacoes.criadaEm), desc(notificacoes.id))
    .limit(limite);

  const [{ total }] = await db
    .select({ total: sql`count(*)::int` })
    .from(notificacoes)
    .where(isNull(notificacoes.lidaEm));

  return { itens, naoLidas: Number(total) };
}

export async function marcarTodasLidas() {
  await db
    .update(notificacoes)
    .set({ lidaEm: new Date() })
    .where(isNull(notificacoes.lidaEm));
}

export async function marcarLida(id) {
  await db
    .update(notificacoes)
    .set({ lidaEm: new Date() })
    .where(and(eq(notificacoes.id, id), isNull(notificacoes.lidaEm)));
}
