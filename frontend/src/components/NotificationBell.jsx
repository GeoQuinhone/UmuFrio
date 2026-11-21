import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { apiRequest } from "../api.js";
import Icon from "./Icon.jsx";
import { atendimentosProximos, textoFaltam } from "../utils/avisoHorario.js";

// Fase 8 — sino de notificações.
//  - CEO: avisos gravados pelo servidor (estoque no mínimo/zerado, atendimento
//    iniciado/concluído, não realizado, cancelado) + pendências ao vivo
//    (pagamentos em aberto e estoque crítico). Atualiza a cada 30 s.
//  - Técnico: atendimentos que estão perto do horário.
//  - Demais perfis: sem notificações.

const ICONES = {
  estoque_baixo: ["package", "aviso"],
  estoque_zerado: ["package", "erro"],
  atendimento_iniciado: ["wrench", "info"],
  atendimento_concluido: ["check", "ok"],
  nao_realizado: ["alertTriangle", "erro"],
  cancelado: ["ban", "aviso"],
  falta_peca: ["package", "aviso"],
};

export function tempoRelativo(iso, agora = new Date()) {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  const min = Math.round((agora.getTime() - data.getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `há ${horas} h`;
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
}

const moeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function NotificationBell({ perfil, usuarioId, agendamentos = [] }) {
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState({ itens: [], naoLidas: 0, pendencias: null });
  const [erro, setErro] = useState(false);
  const [agora, setAgora] = useState(() => new Date());
  const ref = useRef(null);
  const ehCeo = perfil === "ceo";

  const carregar = useCallback(async () => {
    if (!ehCeo) return;
    try {
      setDados(await apiRequest("/notificacoes"));
      setErro(false);
    } catch {
      setErro(true);
    }
  }, [ehCeo]);

  useEffect(() => {
    carregar();
    if (!ehCeo) return undefined;
    const id = setInterval(carregar, 30000);
    return () => clearInterval(id);
  }, [carregar, ehCeo]);

  useEffect(() => {
    if (perfil !== "tecnico") return undefined;
    const id = setInterval(() => setAgora(new Date()), 30000);
    return () => clearInterval(id);
  }, [perfil]);

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (evento) => {
      if (ref.current && !ref.current.contains(evento.target)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  async function marcarTodas() {
    try {
      await apiRequest("/notificacoes/lidas", { method: "PATCH" });
      await carregar();
    } catch {
      setErro(true);
    }
  }

  const proximos = perfil === "tecnico" ? atendimentosProximos(agendamentos, usuarioId, agora) : [];
  const p = dados.pendencias;
  const pendenciasAtivas = ehCeo && p
    ? Number(p.pagamentosPendentes) + Number(p.estoqueZerado) + Number(p.estoqueBaixo)
    : 0;
  const contador = ehCeo ? dados.naoLidas : proximos.length;

  return (
    <div className="app-notification-wrap" ref={ref}>
      <button
        type="button"
        className="app-notification-button"
        aria-label={contador ? `Notificações (${contador} novas)` : "Notificações"}
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
      >
        <Icon name="bell" size={18} />
        {contador > 0 && <span className="app-notification-badge">{contador > 9 ? "9+" : contador}</span>}
      </button>

      {aberto && (
        <div className="app-notification-popover notif-popover" role="dialog" aria-label="Notificações">
          <div className="notif-head">
            <strong>Notificações</strong>
            {ehCeo && dados.naoLidas > 0 && (
              <button type="button" className="notif-link" onClick={marcarTodas}>
                Marcar todas como lidas
              </button>
            )}
          </div>

          {!ehCeo && perfil !== "tecnico" && <p className="notif-vazio">Sem notificações no momento.</p>}

          {perfil === "tecnico" && (
            <ul className="notif-lista">
              {proximos.length === 0 && <li className="notif-vazio">Nenhum atendimento próximo do horário.</li>}
              {proximos.map((a) => (
                <li key={a.id} className="notif-item notif-aviso">
                  <Icon name="clock" size={16} />
                  <div>
                    <strong>{String(a.hora).slice(0, 5)} · {a.clienteNome}</strong>
                    <span>{a.servicoNome || "Atendimento"} {textoFaltam(a.minutos)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {ehCeo && (
            <>
              {erro && <p className="notif-vazio">Não foi possível atualizar agora.</p>}

              {pendenciasAtivas > 0 && (
                <div className="notif-pendencias">
                  <span className="notif-secao">Pendências agora</span>
                  {Number(p.pagamentosPendentes) > 0 && (
                    <Link to="/relatorios" onClick={() => setAberto(false)} className="notif-pendencia">
                      <Icon name="wallet" size={15} />
                      <span>
                        {p.pagamentosPendentes} pagamento(s) pendente(s) · {moeda(p.valorPendente)}
                      </span>
                    </Link>
                  )}
                  {Number(p.estoqueZerado) > 0 && (
                    <Link to="/estoque" onClick={() => setAberto(false)} className="notif-pendencia notif-erro">
                      <Icon name="package" size={15} />
                      <span>{p.estoqueZerado} produto(s) zerado(s)</span>
                    </Link>
                  )}
                  {Number(p.estoqueBaixo) > 0 && (
                    <Link to="/estoque" onClick={() => setAberto(false)} className="notif-pendencia">
                      <Icon name="package" size={15} />
                      <span>{p.estoqueBaixo} produto(s) no estoque mínimo</span>
                    </Link>
                  )}
                </div>
              )}

              <span className="notif-secao">Atividade recente</span>
              <ul className="notif-lista">
                {dados.itens.length === 0 && <li className="notif-vazio">Sem notificações no momento.</li>}
                {dados.itens.map((n) => {
                  const [icone, tom] = ICONES[n.tipo] || ["bell", "info"];
                  return (
                    <li key={n.id} className={`notif-item notif-${tom}${n.lidaEm ? " is-lida" : ""}`}>
                      <Icon name={icone} size={16} />
                      <div>
                        <strong>{n.titulo}</strong>
                        <span>{n.mensagem}</span>
                        <small>{tempoRelativo(n.criadaEm, agora)}</small>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
//Adicionando comentario para comitarr