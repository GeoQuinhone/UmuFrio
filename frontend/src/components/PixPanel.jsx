import React, { useCallback, useEffect, useRef, useState } from "react";

import { apiRequest } from "../api.js";
import Icon from "./Icon.jsx";
import { formatMoeda } from "../utils/atendimento.js";
import "./pix-panel.css";

const INTERVALO_CONSULTA_MS = 4000;

function formatarTempo(segundos) {
  const total = Math.max(0, segundos);
  const minutos = String(Math.floor(total / 60)).padStart(2, "0");
  const resto = String(total % 60).padStart(2, "0");
  return `${minutos}:${resto}`;
}

async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Alternativa para navegadores sem permissão de área de transferência.
    try {
      const area = document.createElement("textarea");
      area.value = texto;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

// Cobrança PIX do atendimento (Fase 4). Funciona em dois modos:
//  - mercadopago: QR Code e copia-e-cola reais; a baixa é automática;
//  - simulado: sem credenciais, para demonstração (botão "Simular pagamento").
// A confirmação nunca vem do navegador: o servidor consulta o Mercado Pago e
// só então marca o pagamento como confirmado.
export default function PixPanel({
  ordemId,
  valorAtual,
  preparar,
  onAprovado,
}) {
  const [modo, setModo] = useState(null);
  const [cobranca, setCobranca] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [agora, setAgora] = useState(() => Date.now());
  const avisouAprovado = useRef(false);

  const aplicar = useCallback(
    (resposta) => {
      if (resposta?.modo) setModo(resposta.modo);
      const nova = resposta?.cobranca ?? null;
      setCobranca(nova);
      if (nova?.status === "aprovado" && !avisouAprovado.current) {
        avisouAprovado.current = true;
        onAprovado?.(nova);
      }
    },
    [onAprovado],
  );

  // Carrega a cobrança existente ao abrir.
  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    apiRequest(`/ordens-servico/${ordemId}/pix`)
      .then((resposta) => ativo && aplicar(resposta))
      .catch((falha) => ativo && setErro(falha.message))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [ordemId, aplicar]);

  const pendente = cobranca?.status === "pendente";

  // Consulta o servidor enquanto a cobrança está aberta.
  useEffect(() => {
    if (!pendente) return undefined;
    const consulta = setInterval(() => {
      apiRequest(`/ordens-servico/${ordemId}/pix`)
        .then(aplicar)
        .catch(() => {
          // Falha momentânea de rede: tenta de novo no próximo ciclo.
        });
    }, INTERVALO_CONSULTA_MS);
    return () => clearInterval(consulta);
  }, [pendente, ordemId, aplicar]);

  // Relógio da contagem regressiva.
  useEffect(() => {
    if (!pendente) return undefined;
    const relogio = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(relogio);
  }, [pendente]);

  async function executar(acao) {
    setErro("");
    setOcupado(true);
    try {
      await acao();
    } catch (falha) {
      setErro(falha.message);
    } finally {
      setOcupado(false);
    }
  }

  const gerar = () =>
    executar(async () => {
      // Salva valor, forma e observação antes: o servidor cobra o valor gravado.
      await preparar();
      avisouAprovado.current = false;
      aplicar(await apiRequest(`/ordens-servico/${ordemId}/pix`, { method: "POST" }));
    });

  const cancelar = () =>
    executar(async () => {
      aplicar(
        await apiRequest(`/ordens-servico/${ordemId}/pix/cancelar`, {
          method: "POST",
        }),
      );
    });

  const simular = () =>
    executar(async () => {
      aplicar(
        await apiRequest(`/ordens-servico/${ordemId}/pix/simular`, {
          method: "POST",
        }),
      );
    });

  async function copiar() {
    if (await copiarTexto(cobranca.codigoCopiaECola)) {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } else {
      setErro("Não foi possível copiar. Selecione o código e copie manualmente.");
    }
  }

  if (carregando) {
    return (
      <section className="pix-panel" aria-busy="true">
        <p className="pix-muted">Verificando cobrança PIX...</p>
      </section>
    );
  }

  const simulado = modo === "simulado";
  const restante = cobranca?.expiraEm
    ? Math.round((new Date(cobranca.expiraEm).getTime() - agora) / 1000)
    : 0;
  const valorMudou =
    pendente &&
    valorAtual !== null &&
    Math.round(valorAtual * 100) !== Math.round(Number(cobranca.valor) * 100);
  const mostrarGerar = !cobranca || ["cancelado", "expirado"].includes(cobranca.status);

  return (
    <section className="pix-panel" aria-label="Cobrança PIX">
      <header className="pix-heading">
        <strong>PIX</strong>
        <span className={`pix-mode ${simulado ? "is-demo" : "is-live"}`}>
          {simulado ? "Modo demonstração" : "Mercado Pago"}
        </span>
      </header>

      {erro && (
        <p className="catalog-form-error" role="alert">
          {erro}
        </p>
      )}

      {cobranca?.status === "aprovado" && (
        <p className="pix-success" role="status">
          <Icon name="check" size={16} />
          <span>
            PIX de <strong>{formatMoeda(cobranca.valor)}</strong> recebido.
            Pagamento confirmado automaticamente.
          </span>
        </p>
      )}

      {mostrarGerar && (
        <>
          {cobranca && (
            <p className="pix-muted" role="status">
              {cobranca.status === "expirado"
                ? "O PIX anterior expirou."
                : "O PIX anterior foi cancelado."}{" "}
              Gere um novo para continuar.
            </p>
          )}
          {!cobranca && (
            <p className="pix-muted">
              Gere o QR Code para o cliente pagar. A baixa é automática quando
              o pagamento é identificado.
            </p>
          )}
          <button
            type="button"
            className="btn-primary"
            onClick={gerar}
            disabled={ocupado}
          >
            {ocupado ? "Gerando..." : "Gerar PIX"}
          </button>
        </>
      )}

      {pendente && (
        <div className="pix-charge">
          <div className="pix-qr" aria-label="QR Code do PIX">
            {cobranca.qrCodeBase64 ? (
              <img
                src={`data:image/png;base64,${cobranca.qrCodeBase64}`}
                alt={`QR Code PIX de ${formatMoeda(cobranca.valor)}`}
                width="176"
                height="176"
              />
            ) : (
              <div className="pix-qr-demo">
                <Icon name="wallet" size={30} />
                <span>QR de demonstração</span>
              </div>
            )}
          </div>

          <div className="pix-details">
            <p className="pix-amount">
              <span>Valor</span>
              <strong>{formatMoeda(cobranca.valor)}</strong>
            </p>
            <p
              className={`pix-timer ${restante <= 60 ? "is-urgent" : ""}`}
              role="timer"
            >
              <Icon name="clock" size={14} />
              {restante > 0
                ? `Expira em ${formatarTempo(restante)}`
                : "Expirando... aguarde a atualização"}
            </p>

            <label className="pix-code-label" htmlFor="pix-copia-cola">
              PIX copia e cola
            </label>
            <div className="pix-code-row">
              <input
                id="pix-copia-cola"
                className="input pix-code"
                readOnly
                value={cobranca.codigoCopiaECola}
                onFocus={(event) => event.target.select()}
              />
              <button type="button" className="btn-ghost" onClick={copiar}>
                <Icon name={copiado ? "check" : "copy"} size={15} />
                {copiado ? "Copiado" : "Copiar"}
              </button>
            </div>

            <p className="pix-muted" role="status">
              Aguardando pagamento... esta tela atualiza sozinha.
            </p>

            {valorMudou && (
              <p className="pix-warning" role="status">
                O valor cobrado mudou desde que este PIX foi gerado. Gere o PIX
                novamente para cobrar {formatMoeda(valorAtual)}.
              </p>
            )}

            <div className="pix-actions">
              {valorMudou && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={gerar}
                  disabled={ocupado}
                >
                  Gerar PIX com o novo valor
                </button>
              )}
              {simulado && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={simular}
                  disabled={ocupado}
                >
                  Simular pagamento (demonstração)
                </button>
              )}
              <button
                type="button"
                className="btn-ghost"
                onClick={cancelar}
                disabled={ocupado}
              >
                Cancelar PIX
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
