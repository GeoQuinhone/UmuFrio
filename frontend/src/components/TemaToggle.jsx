import React from "react";

import Icon from "./Icon.jsx";
import useTema from "../hooks/useTema.js";

// Botão que alterna entre o tema claro e o escuro (útil ao usar o app sob sol forte).
export default function TemaToggle({ className = "app-notification-button" }) {
  const { escuro, alternar } = useTema();
  const rotulo = escuro ? "Ativar tema claro" : "Ativar tema escuro";
  return (
    <button type="button" className={`${className} tema-toggle`} onClick={alternar} aria-label={rotulo} title={rotulo}>
      <Icon name={escuro ? "sun" : "moon"} size={18} />
    </button>
  );
}
