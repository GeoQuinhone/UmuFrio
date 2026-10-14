import { eq, sql } from "drizzle-orm";
import {
    ordensServico, produtos, movimentacoesEstoque,
} from "./db/schema.js";

export function erroHttp(mensagem, status) {
    const error = new Error(mensagem);
    error.status = status;
    return error;
}

// Exclui uma ordem de serviço dentro de uma transação. Se ela estava em
// andamento, as peças já debitadas (do serviço e as extras) voltam ao
// estoque e as movimentacoes dela são removidas. Ordens concluídas não podem
// ser excluídas: o histórico de estoque e de pagamento precisa ser preservado.

export async function excluirOrdem(tx,ordemId) {
    const [ordem] = await tx
    .select()
    .from(ordensServico)
    .where(eq(ordensServico.id, ordemId));

    if (!ordem) {
        throw erroHttp("Ordem de serviço não encontrada.", 404);
    }

    if (ordem.status === "concluida") {
        throw erroHttp(
            "Não é possível excluir um atendimento já concluído, pois o histórico de estoque e de pagamento precisa ser preservado.", 409,);
    }

    if (ordem.status === "andamento") {
        const movimentacoes = await tx 
        .select()
        .from(movimentacoesEstoque)
        .where(eq(movimentacoesEstoque.ordemServicoId, ordemId));

        for (const movimentacoes of movimentacoes) {
            if (movimentacao.tipo === "saida") {
                await tx
                .update(produtos)
                .set({
                    saldo: sql `${produtos.saldo} + ${movimentacoes.quantidade}`,
                })
                .where(eq(produtos.id, movimetnacao.produtosId));
            }
        }

        await tx 
        .delete(movimentacoesEstoque)
        .where(eq(movimentacoesEstoque.ordemServicoId, ordemId));
    }

    await tx.delete(ordensServico).where(eq(ordensServico.id, ordemId));

    return ordem;
}