// Cada módulo tem um
// endereço próprio (ex.: /clientes), o que permite abrir uma tela direto pelo
// link, usar os botões voltar/avançar do navegador e recarregar a página sem
// perder o lugar.
//
// `key` é o identificador usado pelo painel inicial (Welcome) para pedir uma
// navegação; `roles` define quem enxerga o item no menu e quem pode abrir a
// rota (o backend continua sendo a barreira real de permissão).
export const ROTAS = [
  {
    key: "welcome",
    path: "/",
    label: "Início",
    icon: "dashboard",
    roles: ["ceo", "atendente", "tecnico", "estoquista"],
  },
  {
    key: "clientes",
    path: "/clientes",
    label: "Clientes",
    icon: "users",
    roles: ["ceo", "atendente"],
  },
  {
    key: "usuarios",
    path: "/usuarios",
    label: "Usuários",
    icon: "userSettings",
    roles: ["ceo"],
  },
  {
    key: "servicos",
    path: "/servicos",
    label: "Serviços",
    icon: "wrench",
    roles: ["ceo", "atendente"],
  },
  {
    key: "estoque",
    path: "/estoque",
    label: "Estoque",
    icon: "package",
    roles: ["ceo", "estoquista"],
  },
    {
    // Frota da empresa, com o técnico responsável por cada veículo.
    key: "veiculos",
    path: "/veiculos",
    label: "Veículos",
    icon: "truck",
    roles: ["ceo"],
  },
  {
    
    // Ponto 10: agendamento e ordem de serviço são um fluxo só, nesta tela.
    key: "agendamentos",
    path: "/agendamentos",
    label: "Agendamentos",
    icon: "calendar",
    roles: ["ceo", "atendente", "tecnico"],
  },
  {
    // Fase 8: controle de gastos (alimenta o lucro dos relatórios), só o CEO.
    key: "despesas",
    path: "/despesas",
    label: "Despesas",
    icon: "wallet",
    roles: ["ceo"],
  },
  {
    // Fase 4: relatórios estratégicos, somente o CEO.
    key: "relatorios",
    path: "/relatorios",
    label: "Relatórios",
    icon: "chart",
    roles: ["ceo"],
  },
];

export function caminhoDaChave(key) {
  return ROTAS.find((rota) => rota.key === key)?.path || "/";
}

export function rotaPermitida(path, perfil) {
  return ROTAS.some(
    (rota) => rota.path === path && rota.roles.includes(perfil),
  );
}
