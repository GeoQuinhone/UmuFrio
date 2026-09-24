import React from "react";

import { useAuth } from "../AuthContext.jsx";

export default function Layout({
  title,
  subtitle,
  onBack,
  children,
}) {
  const { user, logout } = useAuth();

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-left">
          {onBack && (
            <button className="btn-link" onClick={onBack}>
              ← Voltar à tela inicial
            </button>
          )}

          <h1>{title}</h1>

          {subtitle && (
            <p className="subtitle">{subtitle}</p>
          )}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "8px",
          }}
        >
          <div className="brand-mini">
            <span className="brand-dot" />
            UmuFrio
          </div>

          {user && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                color: "var(--grey)",
                fontSize: "0.85rem",
              }}
            >
              <span>
                {user.nome} ({user.perfil})
              </span>

              <button
                onClick={logout}
                className="btn-link"
              >
                Sair
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="page-content">{children}</main>
    </div>
  );
}