import React from "react";
import Icon from "./Icon.jsx";

export default function Layout({
  title,
  subtitle,
  onBack,
  action,
  children,
}) {
  return (
    <section className="module-view">
      <header className="module-heading">
        <div className="module-heading-copy">
          {onBack && (
            <button
              type="button"
              className="module-back"
              onClick={onBack}
            >
              <Icon name="chevronLeft" size={15} />
              Início
            </button>
          )}
          <h1>{title}</h1>
          {subtitle && <p className="subtitle">{subtitle}</p>}
        </div>
        {action && <div className="module-heading-action">{action}</div>}
      </header>
      <div className="module-content">{children}</div>
    </section>
  );
}