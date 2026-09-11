import React from "react";

export default function Layout({ title, subtitle, onBack, children }) {
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
          {subtitle && <p className="subtitle">{subtitle}</p>}
        </div>
        <div className="brand-mini">
          <span className="brand-dot" />
          UmuFrio
        </div>
      </header>
      <main className="page-content">{children}</main>
    </div>
  );
}
