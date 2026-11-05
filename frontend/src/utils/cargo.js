// Fase 8: nome do cargo (perfil) de quem está logado, para exibir no topo.
export const CARGOS = {
  ceo: "CEO",
  atendente: "Atendente",
  tecnico: "Técnico",
  estoquista: "Estoquista",
};

export function cargoLabel(perfil) {
  return CARGOS[perfil] || "Usuário";
}
