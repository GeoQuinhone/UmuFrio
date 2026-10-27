import React, { useEffect, useRef, useState } from "react";

import { apiRequest } from "../api.js";
import Icon from "./Icon.jsx";
import { linkWhatsapp } from "../utils/whatsapp.js";
import "./chat-widget.css";

// Assistente de atendimento da tela de login (Fase 5). Informa sobre serviços,
// horário e formas de pagamento e encaminha para o WhatsApp. Não guarda
// conversa: o histórico vive só nesta tela.

const SUGESTOES = [
  "Quais serviços vocês fazem?",
  "Qual o horário de atendimento?",
  "Como posso pagar?",
  "Quero falar com um atendente",
];

const LIMITE_HISTORICO = 10;
const MAX_CARACTERES = 600;

export default function ChatWidget() {
  const [aberto, setAberto] = useState(false);
  const [config, setConfig] = useState(null);
  const [mensagens, setMensagens] = useState([]); // {papel, texto, erro?}
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState(linkWhatsapp());
  const [encaminhar, setEncaminhar] = useState(false);
  const fimRef = useRef(null);
  const campoRef = useRef(null);

  useEffect(() => {
    if (!aberto || config) return;
    apiRequest("/chat/config")
      .then((c) => {
        setConfig(c);
        if (c.whatsappUrl) setWhatsappUrl(c.whatsappUrl);
      })
      .catch(() => setConfig({ empresa: "UmuFrio", modo: "indisponivel" }));
  }, [aberto, config]);

  useEffect(() => {
    if (aberto) campoRef.current?.focus();
  }, [aberto]);

  useEffect(() => {
    fimRef.current?.scrollIntoView?.({ block: "end" });
  }, [mensagens, enviando, aberto]);

  useEffect(() => {
    if (!aberto) return undefined;
    const aoTeclar = (e) => e.key === "Escape" && setAberto(false);
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberto]);

  async function enviar(conteudo) {
    const limpo = conteudo.trim();
    if (!limpo || enviando) return;

    const historico = [
      ...mensagens.filter((m) => !m.erro),
      { papel: "usuario", texto: limpo },
    ];
    setMensagens([...mensagens, { papel: "usuario", texto: limpo }]);
    setTexto("");
    setEnviando(true);
    setEncaminhar(false);

    try {
      const corpo = historico
        .slice(-LIMITE_HISTORICO)
        .map(({ papel, texto: t }) => ({ papel, texto: t }));
      // A conversa enviada precisa começar por uma fala do cliente.
      while (corpo.length && corpo[0].papel !== "usuario") corpo.shift();

      const r = await apiRequest("/chat", {
        method: "POST",
        body: JSON.stringify({ mensagens: corpo }),
      });
      setMensagens((atual) => [...atual, { papel: "assistente", texto: r.resposta }]);
      if (r.whatsappUrl) setWhatsappUrl(r.whatsappUrl);
      setEncaminhar(Boolean(r.encaminhar));
    } catch (falha) {
      setMensagens((atual) => [
        ...atual,
        {
          papel: "assistente",
          erro: true,
          texto: falha.message || "Não consegui responder agora. Tente novamente.",
        },
      ]);
    } finally {
      setEnviando(false);
    }
  }

  function aoEnviar(e) {
    e.preventDefault();
    enviar(texto);
  }

  const empresa = config?.empresa || "UmuFrio";

  return (
    <>
      {!aberto && (
        <button
          type="button"
          className="chat-fab"
          onClick={() => setAberto(true)}
          aria-label="Abrir atendimento por chat"
        >
          <Icon name="chat" size={22} />
          <span>Fale conosco</span>
        </button>
      )}

      {aberto && (
        <section className="chat-box" role="dialog" aria-label={`Atendimento ${empresa}`}>
          <header className="chat-head">
            <div>
              <strong>Atendimento {empresa}</strong>
              {config?.modo === "demonstracao" && (
                <span className="chat-badge">Modo demonstração</span>
              )}
              {config?.modo === "indisponivel" && (
                <span className="chat-badge">Assistente indisponível</span>
              )}
            </div>
            <a
              className="chat-head-whats"
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Falar no WhatsApp"
              title="Falar no WhatsApp"
            >
              <Icon name="whatsapp" size={18} />
            </a>
            <button
              type="button"
              className="chat-close"
              onClick={() => setAberto(false)}
              aria-label="Fechar chat"
            >
              ×
            </button>
          </header>

          <div className="chat-body" aria-live="polite">
            <div className="chat-msg is-bot">
              Olá! Sou o assistente virtual da {empresa}. Posso falar sobre
              serviços, horários e formas de pagamento. Como posso ajudar?
            </div>

            {mensagens.length === 0 && (
              <div className="chat-chips">
                {SUGESTOES.map((s) => (
                  <button key={s} type="button" onClick={() => enviar(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            {mensagens.map((m, i) => (
              <div
                key={i}
                className={`chat-msg ${m.papel === "usuario" ? "is-user" : "is-bot"}${m.erro ? " is-error" : ""}`}
              >
                {m.texto}
              </div>
            ))}

            {enviando && (
              <div className="chat-msg is-bot chat-typing" aria-label="Digitando">
                <span /><span /><span />
              </div>
            )}

            {encaminhar && (
              <a
                className="chat-whats"
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="whatsapp" size={16} />
                Falar no WhatsApp
              </a>
            )}
            <div ref={fimRef} />
          </div>

          <form className="chat-form" onSubmit={aoEnviar}>
            <input
              ref={campoRef}
              type="text"
              value={texto}
              maxLength={MAX_CARACTERES}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Digite sua mensagem"
              aria-label="Mensagem"
              disabled={enviando}
            />
            <button type="submit" disabled={enviando || !texto.trim()} aria-label="Enviar">
              <Icon name="send" size={18} />
            </button>
          </form>
          <p className="chat-foot">
            Não informe senhas nem dados de pagamento. Respostas automáticas.{" "}
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
              Prefere o WhatsApp?
            </a>
          </p>
        </section>
      )}
    </>
  );
}
