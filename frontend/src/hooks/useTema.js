import { useCallback, useEffect, useState } from "react";

const CHAVE = "uf-tema";

export function lerTemaSalvo() {
  try {
    const salvo = localStorage.getItem(CHAVE);
    if (salvo === "dark" || salvo === "light") return salvo;
  } catch {
    // armazenamento bloqueado: segue o tema do aparelho
  }
  try {
    if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark";
  } catch {
    // sem matchMedia
  }
  return "light";
}

export function aplicarTema(tema) {
  const raiz = document.documentElement;
  raiz.setAttribute("data-theme", tema);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", tema === "dark" ? "#0f1a21" : "#12325b");
}

// Tema claro/escuro: lembra a escolha neste aparelho (localStorage).
export default function useTema() {
  const [tema, setTema] = useState(() => lerTemaSalvo());

  useEffect(() => {
    aplicarTema(tema);
  }, [tema]);

  const alternar = useCallback(() => {
    setTema((atual) => {
      const novo = atual === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(CHAVE, novo);
      } catch {
        // sem armazenamento: vale só nesta visita
      }
      return novo;
    });
  }, []);

  return { tema, escuro: tema === "dark", alternar };
}
