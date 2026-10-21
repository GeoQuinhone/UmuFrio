import { useEffect, useState } from "react";

import { apiRequest } from "../api.js";

// Fase 6 — atalho do WhatsApp. O número oficial é (44) 9804-9224. Se o
// servidor tiver outro em CHAT_WHATSAPP, o link dele (vindo de /api/chat/config)
// vale no lugar deste; se o servidor estiver fora do ar, usamos o padrão.
export const WHATSAPP_NUMERO = "5544998049224";
export const WHATSAPP_MENSAGEM = "Olá! Vim pelo site da UmuFrio e gostaria de atendimento.";

export function linkWhatsapp(numero = WHATSAPP_NUMERO, mensagem = WHATSAPP_MENSAGEM) {
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}

export function useWhatsappUrl() {
  const [url, setUrl] = useState(linkWhatsapp());
  useEffect(() => {
    let ativo = true;
    apiRequest("/chat/config")
      .then((c) => ativo && c.whatsappUrl && setUrl(c.whatsappUrl))
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);
  return url;
}
