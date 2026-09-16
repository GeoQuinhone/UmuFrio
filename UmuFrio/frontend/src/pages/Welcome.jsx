import React from "react";

const SHORTCUTS = [
  {
    key: "clientes",
    title: "Clientes",
    desc: "Cadastrar, editar e inativar clientes.",
    icon: "👤",
  },
  {
    key: "agendamentos",
    title: "Agendamentos",
    desc: "Agendar e cancelar serviços.",
    icon: "📅",
  },
  {
    key: "ordens",
    title: "Ordens de Serviço",
    desc: "Acompanhar a execução dos atendimentos.",
    icon: "🛠️",
  },
  {
    key: "estoque",
    title: "Estoque",
    desc: "Controlar entrada e saída de produtos.",
    icon: "📦",
  },
  {
    key: "usuarios",
    title: "Usuários e Técnicos",
    desc: "Cadastrar usuários e definir perfis.",
    icon: "🔑",
  },
];

export default function Welcome({ onNavigate }) {
  return (
    <div className="welcome">
      <div className="welcome-hero">
        <span className="brand-dot brand-dot-lg" />
        <h1>Bem-vindo ao UmuFrio</h1>
        <p>
          Sistema de gestão operacional para empresas de refrigeração e
          climatização. Escolha abaixo o módulo que deseja abrir.
        </p>
      </div>

      <div className="shortcut-grid">
        {SHORTCUTS.map((s) => (
          <button
            key={s.key}
            className="shortcut-card"
            onClick={() => onNavigate(s.key)}
          >
            <span className="shortcut-icon">{s.icon}</span>
            <span className="shortcut-title">{s.title}</span>
            <span className="shortcut-desc">{s.desc}</span>
            <span className="shortcut-cta">Abrir →</span>
          </button>
        ))}
      </div>

      <footer className="welcome-footer">
        TCC · Tecnólogo em Sistemas para Internet · UniALFA — Protótipo Para Apresentar o CRUD
      </footer>
    </div>
  );
}
