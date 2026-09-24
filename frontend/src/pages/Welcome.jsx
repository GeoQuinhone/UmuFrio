import React from "react";

import { useAuth } from "../AuthContext.jsx";

const ALL_SHORTCUTS = [
  {
    key: "clientes",
    title: "Clientes",
    desc: "Cadastrar, editar e inativar clientes.",
    icon: "👤",
    roles: ["ceo", "atendente"],
  },
  {
    key: "agendamentos",
    title: "Agendamentos",
    desc: "Agendar e cancelar serviços.",
    icon: "📅",
    roles: ["ceo", "atendente", "tecnico"],
  },
  {
    key: "ordens",
    title: "Ordens de Serviço",
    desc: "Acompanhar a execução dos atendimentos.",
    icon: "🛠️",
    roles: ["ceo", "atendente", "tecnico"],
  },
  {
    key: "estoque",
    title: "Estoque",
    desc: "Controlar entrada e saída de produtos.",
    icon: "📦",
    roles: ["ceo", "estoquista"],
  },
  {
    key: "usuarios",
    title: "Usuários e Técnicos",
    desc: "Cadastrar usuários e definir perfis.",
    icon: "🔑",
    roles: ["ceo"],
  },
];

export default function Welcome({ onNavigate }) {
  const { user, logout } = useAuth();

  const allowedShortcuts = ALL_SHORTCUTS.filter((shortcut) =>
    shortcut.roles.includes(user.perfil),
  );

  return (
    <div className="welcome">
      <header
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 24px",
          marginBottom: "48px",
          background: "rgba(0, 0, 0, 0.15)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
        }}
      >
        <div
          style={{
            color: "white",
            fontWeight: "600",
          }}
        >
          Olá, {user.nome} ({user.perfil})
        </div>

        <button
          onClick={logout}
          style={{
            border: "1px solid rgba(255, 255, 255, 0.45)",
            borderRadius: "8px",
            padding: "8px 14px",
            background: "transparent",
            color: "white",
            fontWeight: "600",
          }}
        >
          Sair
        </button>
      </header>

      <div className="welcome-hero">
        <span className="brand-dot brand-dot-lg" />

        <h1>Bem-vindo ao UmuFrio</h1>

        <p>
          Sistema de gestão operacional para empresas de
          refrigeração e climatização. Escolha abaixo o módulo
          que deseja abrir.
        </p>
      </div>

      <div className="shortcut-grid">
        {allowedShortcuts.map((shortcut) => (
          <button
            key={shortcut.key}
            className="shortcut-card"
            onClick={() => onNavigate(shortcut.key)}
          >
            <span className="shortcut-icon">
              {shortcut.icon}
            </span>

            <span className="shortcut-title">
              {shortcut.title}
            </span>

            <span className="shortcut-desc">
              {shortcut.desc}
            </span>

            <span className="shortcut-cta">
              Abrir →
            </span>
          </button>
        ))}
      </div>

      <footer className="welcome-footer">
        TCC · Tecnólogo em Sistemas para Internet · UniALFA
      </footer>
    </div>
  );
}