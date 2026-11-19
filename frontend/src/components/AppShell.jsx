import React, { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

import { useAuth } from "../AuthContext.jsx";
import Icon from "./Icon.jsx";
import NotificationBell from "./NotificationBell.jsx";
import TemaToggle from "./TemaToggle.jsx";
import { cargoLabel } from "../utils/cargo.js";
import { atendimentosProximos, textoFaltam } from "../utils/avisoHorario.js";
import { ROTAS } from "../routes.js";


export default function AppShell({ children, agendamentos = [] }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dispensados, setDispensados] = useState([]);
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    if (user?.perfil !== "tecnico") return undefined;
    const id = setInterval(() => setAgora(new Date()), 30000);
    return () => clearInterval(id);
  }, [user?.perfil]);

  // Fase 8: faixa de aviso quando um atendimento do técnico está perto do horário.
  const avisosHorario =
    user?.perfil === "tecnico"
      ? atendimentosProximos(agendamentos, user.id, agora).filter((a) => !dispensados.includes(a.id))
      : [];
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
            <TemaToggle />
            <NotificationBell perfil={user?.perfil} usuarioId={user?.id} agendamentos={agendamentos} />
            <div className="app-user-copy app-user-cargo" title={user?.nome}>
              <span className={`app-cargo-chip cargo-${user?.perfil || "x"}`}>{cargoLabel(user?.perfil)}</span>
              <small>Sessão ativa</small>
            </div>
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

        {avisosHorario.length > 0 && (
          <div className="aviso-horario" role="alert">
            {avisosHorario.slice(0, 2).map((a) => (
              <div key={a.id} className="aviso-horario-item">
                <Icon name="clock" size={17} />
                <span>
                  <strong>{String(a.hora).slice(0, 5)} · {a.clienteNome}</strong> — {textoFaltam(a.minutos)}.
                </span>
                <NavLink to="/agendamentos" className="aviso-horario-link">Ver agenda</NavLink>
                <button
                  type="button"
                  aria-label="Dispensar aviso"
                  className="aviso-horario-fechar"
                  onClick={() => setDispensados((lista) => [...lista, a.id])}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}