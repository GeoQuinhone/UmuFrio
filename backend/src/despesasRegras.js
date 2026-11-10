// Fase 9: vínculo da despesa com veículo (combustível, manutenção) ou com
// funcionário (salários). Regra pura, testável sem banco.

export const CATEGORIAS_COM_VEICULO = ["combustivel", "manutencao"];
export const CATEGORIAS_COM_FUNCIONARIO = ["salarios"];

// Devolve { veiculoId, funcionarioId } só com o vínculo que a categoria aceita;
// o outro vira null. Id inválido (não inteiro positivo) vira { erro }.
export function normalizarVinculos(categoria, { veiculoId, funcionarioId } = {}) {
  const lerId = (v) => {
    if (v === undefined || v === null || v === "") return { ok: true, id: null };
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? { ok: true, id: n } : { ok: false };
  };

  let veiculo = null;
  let funcionario = null;

  if (CATEGORIAS_COM_VEICULO.includes(categoria)) {
    const r = lerId(veiculoId);
    if (!r.ok) return { erro: "Veículo inválido." };
    veiculo = r.id;
  }
  if (CATEGORIAS_COM_FUNCIONARIO.includes(categoria)) {
    const r = lerId(funcionarioId);
    if (!r.ok) return { erro: "Funcionário inválido." };
    funcionario = r.id;
  }
  return { veiculoId: veiculo, funcionarioId: funcionario };
}
