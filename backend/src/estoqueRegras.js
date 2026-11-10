// Regras puras de estoque, compartilhadas por notificações, relatórios e testes.
// Fase 8: uma única definição de "no mínimo" (antes a tela usava saldo < mínimo
// e o relatório saldo <= mínimo, e o produto "pixava" entre os dois).

export function situacaoEstoque(produto) {
  const saldo = Number(produto.saldo);
  const minimo = Number(produto.quantidadeMinima ?? produto.minimo ?? 0);
  if (!(saldo > 0)) return "zerado";
  if (saldo <= minimo) return "baixo";
  return "ok";
}

// Fase 9: limites realistas para uma oficina de refrigeração.
// Um único ponto de ajuste (o front tem a mesma constante em utils/estoque.js).
export const LIMITE_QUANTIDADE = 200; // saldo máximo por produto e por lançamento
export const LIMITE_VALOR_UNITARIO = 50000; // R$ por unidade

export function quantidadeDentroDoLimite(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 0 && n <= LIMITE_QUANTIDADE;
}
