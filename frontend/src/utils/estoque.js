// Fase 8: regras de estoque compartilhadas pelas telas (mesma regra do backend
// e dos relatórios: saldo igual ao mínimo já conta como "no mínimo").
export function minimoDoProduto(produto) {
  return Number(produto?.quantidadeMinima ?? produto?.quantidade_minima ?? 0) || 0;
}

export function situacaoEstoque(produto) {
  const saldo = Number(produto?.saldo ?? 0);
  if (!(saldo > 0)) return "zerado";
  if (saldo <= minimoDoProduto(produto)) return "baixo";
  return "ok";
}

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function moedaProduto(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? moeda.format(n) : "—";
}

// Mesmos limites e mensagens do back-end (backend/src/estoqueRegras.js).
export const LIMITE_QUANTIDADE = 99999999;
export const LIMITE_VALOR_UNITARIO = 99999999.99;
export const MENSAGEM_LIMITE_VALOR =
  "Não é possível cadastrar produtos com valor acima de R$ 99.999.999,99.";
export const MENSAGEM_LIMITE_QUANTIDADE =
  "Não é possível cadastrar produtos com mais de 99.999.999 unidades.";
