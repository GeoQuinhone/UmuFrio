import React, { useCallback, useEffect, useState } from "react";

import { apiRequest } from "../api.js";
import Icon from "./Icon.jsx";
import { formatDateTime } from "../utils/atendimento.js";
import "./checkin-panel.css";

// Check-in / check-out geolocalizado (Fase 5). A posição vem do GPS do
// aparelho do técnico; quem calcula a distância até o endereço do cliente e
// decide se está "dentro do raio" é o servidor.

function lerPosicao() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Este navegador não oferece localização."));
      return;
    }
    const local = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    if (!window.isSecureContext && !local) {
      reject(new Error("O navegador só libera a localização em páginas seguras (HTTPS)."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          precisao: p.coords.accuracy,
        }),
      (erro) => {
        const mensagens = {
          1: "Permissão de localização negada. Libere o acesso à localização no navegador e tente de novo.",
          2: "Não foi possível descobrir sua posição. Verifique se o GPS está ligado.",
          3: "A localização demorou demais. Tente novamente em um lugar com melhor sinal.",
        };
        reject(new Error(mensagens[erro.code] || "Não foi possível obter a localização."));
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });
}

function descricao(registro) {
  if (!registro) return null;
  const quando = formatDateTime(registro.criadoEm);
  if (registro.dentroRaio === null) {
    return { quando, texto: "posição registrada (endereço do cliente sem coordenadas)", tom: "neutro" };
  }
  if (registro.dentroRaio) {
    return { quando, texto: `${registro.distanciaM} m do endereço — dentro do raio de ${registro.raioM} m`, tom: "ok" };
  }
  return {
    quando,
    texto: `${registro.distanciaM} m do endereço — fora do raio de ${registro.raioM} m`,
    justificativa: registro.justificativa,
    tom: "alerta",
  };
}

function Linha({ rotulo, registro }) {
  const d = descricao(registro);
  return (
    <div className="checkin-row">
      <dt>{rotulo}</dt>
      <dd>
        {d ? (
          <>
            <span className={`checkin-chip is-${d.tom}`}>{d.quando}</span> {d.texto}
            {d.justificativa && (
              <small className="checkin-just">Justificativa: {d.justificativa}</small>
            )}
          </>
        ) : (
          <span className="checkin-none">Não registrado</span>
        )}
      </dd>
    </div>
  );
}

export default function CheckinPanel({ ordemId, ordemStatus }) {
  const [info, setInfo] = useState(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [fora, setFora] = useState(null); // { tipo, posicao, distanciaM, raioM, mensagem }
  const [justificativa, setJustificativa] = useState("");

  const carregar = useCallback(async () => {
    try {
      setInfo(await apiRequest(`/ordens-servico/${ordemId}/localizacao`));
    } catch (falha) {
      setErro(falha.message);
    }
  }, [ordemId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function enviar(tipo, posicao, motivo) {
    const resposta = await apiRequest(`/ordens-servico/${ordemId}/${tipo}`, {
      method: "POST",
      body: JSON.stringify({ ...posicao, justificativa: motivo || undefined }),
    });
    return resposta;
  }

  async function registrar(tipo) {
    setErro("");
    setFora(null);
    setEnviando(true);
    try {
      const posicao = await lerPosicao();
      try {
        await enviar(tipo, posicao);
        await carregar();
      } catch (falha) {
        if (falha.dados?.codigo === "FORA_DO_RAIO") {
          setJustificativa("");
          setFora({ tipo, posicao, ...falha.dados, mensagem: falha.message });
        } else {
          throw falha;
        }
      }
    } catch (falha) {
      setErro(falha.message);
    } finally {
      setEnviando(false);
    }
  }

  async function confirmarComJustificativa() {
    if (justificativa.trim().length < 5) {
      setErro("Escreva uma justificativa (mínimo de 5 caracteres).");
      return;
    }
    setErro("");
    setEnviando(true);
    try {
      await enviar(fora.tipo, fora.posicao, justificativa.trim());
      setFora(null);
      await carregar();
    } catch (falha) {
      setErro(falha.message);
    } finally {
      setEnviando(false);
    }
  }

  if (!info) {
    return erro ? (
      <p className="catalog-form-error" role="alert">{erro}</p>
    ) : null;
  }

  const podeCheckin = info.podeRegistrar && !info.checkin && ordemStatus !== "concluida";
  const podeCheckout = info.podeRegistrar && info.checkin && !info.checkout && ordemStatus !== "aberta";
  const aguardaInicio = info.podeRegistrar && info.checkin && !info.checkout && ordemStatus === "aberta";

  // Quem não é o técnico só vê, e só se já houver registro.
  if (!info.podeRegistrar && !info.checkin && !info.checkout) return null;

  return (
    <section className="checkin-panel" aria-label="Check-in e check-out">
      <h3>
        <Icon name="pin" size={16} />
        Localização do atendimento
      </h3>

      <dl className="checkin-list">
        <Linha rotulo="Check-in" registro={info.checkin} />
        <Linha rotulo="Check-out" registro={info.checkout} />
      </dl>

      {erro && (
        <p className="catalog-form-error" role="alert">{erro}</p>
      )}

      {fora && (
        <div className="checkin-warning" role="alertdialog" aria-label="Fora do raio permitido">
          <p>
            <strong>{fora.mensagem}</strong>
          </p>
          <label htmlFor="checkin-just">Justificativa</label>
          <textarea
            id="checkin-just"
            className="input"
            rows={2}
            maxLength={255}
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            placeholder="Ex.: sem vaga em frente ao local, estacionei na rua de trás"
          />
          <div className="checkin-actions">
            <button type="button" className="btn-primary" onClick={confirmarComJustificativa} disabled={enviando}>
              {enviando ? "Registrando..." : "Registrar com justificativa"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => registrar(fora.tipo)} disabled={enviando}>
              Ler a posição de novo
            </button>
            <button type="button" className="btn-ghost" onClick={() => setFora(null)} disabled={enviando}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {!fora && (podeCheckin || podeCheckout) && (
        <div className="checkin-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => registrar(podeCheckin ? "checkin" : "checkout")}
            disabled={enviando}
          >
            <Icon name="pin" size={15} />
            {enviando
              ? "Obtendo localização..."
              : podeCheckin
                ? "Fazer check-in"
                : "Fazer check-out"}
          </button>
          <small>
            Raio permitido: {info.raioM} m do endereço do cliente.
          </small>
        </div>
      )}

      {!fora && aguardaInicio && (
        <p className="checkin-hint">Inicie o atendimento para poder fazer o check-out.</p>
      )}
    </section>
  );
}
