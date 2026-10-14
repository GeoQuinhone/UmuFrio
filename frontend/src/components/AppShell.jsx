import React, { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

import { useAuth } from "../AuthContext.jsx";
import Icon from "./Icon.jsx";
import { ROTAS } from "../routes.js";

function initials(name = "") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const activeItem = ROTAS.find((item) =>
    item.path === "/"
      ? pathname === "/"
      : pathname === item.path || pathname.startsWith(`${item.path}/`),
  );
  const allowedNavigation = ROTAS.filter((item) =>
    item.roles.includes(user?.perfil),
  );

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
        <NavLink
          to="/"
          className="app-brand"
          onClick={() => setMenuOpen(false)}
          aria-label="UmuFrio, ir para a visão geral"
        >
          <span className="app-brand-mark">
            <Icon name="wind" size={22} />
          </span>
          <span className="app-brand-copy">
            <strong>UmuFrio</strong>
            <small>GESTÃO<br />TÉCNICA</small>
          </span>
        </NavLink>

        <nav className="app-nav">
          {allowedNavigation.map((item) => (
            <NavLink
              key={item.key}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                `app-nav-item${isActive ? " is-active" : ""}`
              }
              onClick={() => setMenuOpen(false)}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="app-sidebar-footer">
          <span>
            <strong>UmuFrio Gestão</strong>
            <small>Desenvolvido pela TrinityX </small>
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