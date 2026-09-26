import React, { useState } from "react";

import { useAuth } from "../AuthContext.jsx";
import Icon from "./Icon.jsx";

const navigation = [
  {
    key: "welcome",
    label: "Início",
    icon: "dashboard",
    roles: ["ceo", "atendente", "tecnico", "estoquista"],
  },
  {
    key: "clientes",
    label: "Clientes",
    icon: "users",
    roles: ["ceo", "atendente"],
  },
  {
    key: "usuarios",
    label: "Usuários",
    icon: "userSettings",
    roles: ["ceo"],
  },
  {
    key: "servicos",
    label: "Serviços",
    icon: "wrench",
    roles: ["ceo", "atendente"],
  },
  {
    key: "estoque",
    label: "Estoque",
    icon: "package",
    roles: ["ceo", "estoquista"],
  },
  {
    key: "agendamentos",
    label: "Agendamentos",
    icon: "calendar",
    roles: ["ceo", "atendente", "tecnico"],
  },
  {
    key: "ordens",
    label: "Ordens de Serviço",
    icon: "clipboard",
    roles: ["ceo", "atendente", "tecnico"],
  },
];

function initials(name = "") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function AppShell({
  activePage,
  onNavigate,
  children,
}) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const activeItem = navigation.find((item) => item.key === activePage);
  const allowedNavigation = navigation.filter((item) =>
    item.roles.includes(user?.perfil),
  );

  function navigate(page) {
    onNavigate(page);
    setMenuOpen(false);
  }

  return (
    <div className={`app-shell${menuOpen ? " app-shell-menu-open" : ""}`}>
      {menuOpen && (
        <button
          type="button"
          className="app-sidebar-overlay"
          aria-label="Fechar menu"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <aside className="app-sidebar" aria-label="Navegação principal">
        <button
          type="button"
          className="app-brand"
          onClick={() => navigate("welcome")}
          aria-label="UmuFrio, ir para a visão geral"
        >
          <span className="app-brand-mark">
            <Icon name="wind" size={22} />
          </span>
          <span className="app-brand-copy">
            <strong>UmuFrio</strong>
            <small>GESTÃO<br />TÉCNICA</small>
          </span>
        </button>

        <nav className="app-nav">
          {allowedNavigation.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`app-nav-item${activePage === item.key ? " is-active" : ""}`}
              aria-current={activePage === item.key ? "page" : undefined}
              onClick={() => navigate(item.key)}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="app-sidebar-footer">
          <span>
            <strong>UmuFrio Gestão</strong>
            <small>Ambiente seguro</small>
          </span>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div className="app-topbar-left">
            <button
              type="button"
              className="app-menu-toggle"
              aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Icon name="menu" size={20} />
            </button>
            <div className="app-breadcrumb">
              <span>Operação</span>
              <span className="app-breadcrumb-divider">/</span>
              <strong>{activeItem?.label || "Início"}</strong>
            </div>
          </div>

          <div className="app-topbar-user">
            <div className="app-notification-wrap">
              <button
                type="button"
                className="app-notification-button"
                aria-label="Notificações"
                aria-expanded={showNotifications}
                onClick={() => setShowNotifications((shown) => !shown)}
              >
                <Icon name="bell" size={18} />
              </button>
              {showNotifications && (
                <div className="app-notification-popover" role="status">
                  Sem notificações no momento.
                </div>
              )}
            </div>
            <div className="app-user-copy">
              <span>Olá,</span>
              <strong>{user?.nome?.trim().split(/\s+/)[0] || "Usuário"}</strong>
            </div>
            <span className="app-user-avatar" aria-hidden="true">
              {initials(user?.nome) || "UF"}
            </span>
            <button
              type="button"
              className="app-logout"
              onClick={logout}
              aria-label="Sair"
            >
              <Icon name="logout" size={17} />
            </button>
          </div>
        </header>

        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}