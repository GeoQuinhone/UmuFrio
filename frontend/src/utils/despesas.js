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
