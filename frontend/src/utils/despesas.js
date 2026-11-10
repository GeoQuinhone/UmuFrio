export const CATEGORIAS_DESPESA = [
  { value: "combustivel", label: "Combustível" },
  { value: "salarios", label: "Salários e encargos" },
  { value: "aluguel", label: "Aluguel e contas" },
  { value: "manutencao", label: "Manutenção de veículos" },
  { value: "ferramentas", label: "Ferramentas e equipamentos" },
  { value: "marketing", label: "Marketing" },
  { value: "impostos", label: "Impostos e taxas" },
  { value: "outros", label: "Outros" },
];

export function categoriaLabel(valor) {
  return CATEGORIAS_DESPESA.find((c) => c.value === valor)?.label || valor || "—";
}

// Fase 9: combustível e manutenção podem ser vinculados a um veículo; salários, a um funcionário.
export const CATEGORIAS_COM_VEICULO = ["combustivel", "manutencao"];
export const CATEGORIAS_COM_FUNCIONARIO = ["salarios"];

export function rotuloVeiculo(v) {
  if (!v) return "";
  const nome = [v.marca, v.modelo].filter(Boolean).join(" ") || v.modelo || "Veículo";
  return `${nome} — ${v.placa}`;
}
