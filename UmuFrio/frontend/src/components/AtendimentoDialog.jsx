import React, { useEffect, useRef, useState } from "react";

import Icon from "./Icon.jsx";
import { Badge, Field, Select, TextInput } from "./FormControls.jsx";
import { dialogKeyDown } from "./dialogUtils.js";
import { apiRequest } from "../api.js";
import {
  estadoDoAtendimento,
  formaPagamentoLabel,
  formatDate,
  formatDateTime,
  formatMoeda,
  osCode,
  podeRegistrarPagamento,
} from "../utils/atendimento.js";
import "../pages/clients-users.css";
import "./order-details.css";

// Timeline visual (ponto 18): histórico agendado -> em andamento -> concluído
// com a data e a hora de cada etapa.
function Timeline({ atendimento }) {
  const fluxo = ["aberta", "andamento", "concluida"];
  const indiceAtual = fluxo.indexOf(atendimento.ordemStatus);
  const passos = [
    { key: "aberta", label: "Agendado", timestamp: atendimento.abertaEm },
    { key: "andamento", label: "Em andamento", timestamp: atendimento.iniciadaEm },
    { key: "concluida", label: "Concluído", timestamp: atendimento.concluidaEm },
  ];

  return (
    <ol className="os-timeline" aria-label="Linha do tempo do atendimento">
      {passos.map((passo, index) => {
        const estado =
          index < indiceAtual || passo.timestamp
            ? "done"
            : index === indiceAtual
              ? "current"
              : "pending";
        const dataFormatada = formatDateTime(passo.timestamp);

        return (
          <li key={passo.key} className={`os-timeline-step is-${estado}`}>
            <span className="os-timeline-dot" aria-hidden="true">
              {estado === "done" ? <Icon name="check" size={12} /> : null}
            </span>
            <div className="os-timeline-content">
              <strong>{passo.label}</strong>
              <small>{dataFormatada || (estado === "pending" ? "Pendente" : "—")}</small>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// Peças extras (ponto 12): consumo de peças além das vinculadas ao serviço,
// liberado enquanto o atendimento está em andamento.
function PecasExtras({ ordemId, ordemStatus, produtosAtivos, onConsumo }) {
  const [pecas, setPecas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [produtoId, setProdutoId] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    setCarregando(true);
    try {
      const dados = await apiRequest(`/ordens-servico/${ordemId}/pecas-extras`);
      setPecas(Array.isArray(dados) ? dados : []);
    } catch (fetchError) {
      setErro(fetchError.message);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordemId]);

  async function registrarConsumo(event) {
    event.preventDefault();
    const quantidadeNumerica = Number(quantidade);

    if (!produtoId || !Number.isInteger(quantidadeNumerica) || quantidadeNumerica <= 0) {
      setErro("Selecione uma peça e informe uma quantidade válida.");
      return;
    }

    setSalvando(true);
    setErro("");
    try {
      await apiRequest(`/ordens-servico/${ordemId}/pecas-extras`, {
        method: "POST",
        body: JSON.stringify({ produtoId: Number(produtoId), quantidade: quantidadeNumerica }),
      });
      setProdutoId("");
      setQuantidade("1");
      await carregar();
      onConsumo?.();
    } catch (saveError) {
      setErro(saveError.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="os-extra-parts">
      <h3>Peças extras</h3>
      {carregando ? (
        <p className="os-extra-parts-empty">Carregando...</p>
      ) : pecas.length === 0 ? (
        <p className="os-extra-parts-empty">Nenhuma peça extra registrada neste atendimento.</p>
      ) : (
        <ul className="os-extra-parts-list">
          {pecas.map((peca) => (
            <li key={peca.id}>
              {peca.quantidade}x {peca.produtoNome}
            </li>
          ))}
        </ul>
      )}

      {ordemStatus === "andamento" && (
        <form className="os-extra-parts-form" onSubmit={registrarConsumo}>
          {erro && <p className="catalog-form-error" role="alert">{erro}</p>}
          <Field label="Peça">
            <Select value={produtoId} onChange={(event) => setProdutoId(event.target.value)}>
              <option value="">Selecione...</option>
              {produtosAtivos.map((produto) => (
                <option key={produto.id} value={produto.id}>
                  {produto.nome} (saldo: {produto.saldo})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quantidade">
            <TextInput
              type="number"
              min="1"
              step="1"
              value={quantidade}
              onChange={(event) => setQuantidade(event.target.value)}
            />
          </Field>
          <button type="submit" className="btn-ghost" disabled={salvando}>
            {salvando ? "Descontando..." : "Descontar do estoque"}
          </button>
        </form>
      )}
    </div>
  );
}

function Pagamento({ atendimento, perfil, onPagamento }) {
  const confirmado = Boolean(atendimento.pagamentoConfirmado);
  const podeAlterar = !confirmado || perfil === "ceo";

  return (
    <div className="payment-summary">
      <div className="payment-summary-heading">
        <h3>Pagamento</h3>
        <Badge tone={confirmado ? "green" : "amber"}>
          {confirmado ? "Confirmado" : "Pendente"}
        </Badge>
      </div>

      <dl className="payment-summary-grid">
        <div>
          <dt>Valor cobrado</dt>
          <dd>{formatMoeda(atendimento.valorCobrado ?? atendimento.servicoValor)}</dd>
        </div>
        <div>
          <dt>Forma</dt>
          <dd>{formaPagamentoLabel(atendimento.formaPagamento)}</dd>
        </div>
        {confirmado && atendimento.pagamentoConfirmadoEm && (
          <div>
            <dt>Confirmado em</dt>
            <dd>{formatDateTime(atendimento.pagamentoConfirmadoEm)}</dd>
          </div>
        )}
        {atendimento.observacaoPagamento && (
          <div className="payment-summary-wide">
            <dt>Observação</dt>
            <dd>{atendimento.observacaoPagamento}</dd>
          </div>
        )}
      </dl>

      <button type="button" className="btn-ghost" onClick={onPagamento}>
        <Icon name="wallet" size={15} />
        {podeAlterar
          ? confirmado
            ? "Alterar pagamento"
            : "Registrar pagamento"
          : "Ver pagamento"}
      </button>
    </div>
  );
}

export default function AtendimentoDialog({
  atendimento,
  perfil,
  produtosAtivos = [],
  onClose,
  onPagamento,
  onConsumoPecaExtra,
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const returnFocusTo = document.activeElement;
    dialogRef.current?.querySelector("[data-dialog-initial-focus]")?.focus();
    return () => {
      if (returnFocusTo?.isConnected && typeof returnFocusTo.focus === "function") {
        returnFocusTo.focus();
      }
    };
  }, []);

  if (!atendimento) return null;

  const estado = estadoDoAtendimento(atendimento);
  const cancelado = atendimento.status === "cancelado";
  const endereco = [
    [atendimento.clienteLogradouro, atendimento.clienteNumero].filter(Boolean).join(", "),
    atendimento.clienteBairro,
    [atendimento.clienteCidade, atendimento.clienteEstado].filter(Boolean).join("/"),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="cu-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="cu-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="atendimento-details-title"
        tabIndex="-1"
        onKeyDown={(event) => dialogKeyDown(event, dialogRef.current, onClose)}
      >
        <div className="cu-dialog-heading">
          <div>
            <span className="cu-eyebrow">
              AGENDAMENTO #{atendimento.id}
              {atendimento.ordemId ? ` · ${osCode(atendimento.ordemId)}` : ""}
            </span>
            <h2 id="atendimento-details-title">{atendimento.clienteNome}</h2>
          </div>
          <button
            type="button"
            className="cu-dialog-close"
            data-dialog-initial-focus
            aria-label="Fechar detalhes"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <dl className="cu-detail-grid">
          <div><dt>Serviço</dt><dd>{atendimento.servicoNome || "—"}</dd></div>
          <div><dt>Técnico</dt><dd>{atendimento.tecnicoNome || "—"}</dd></div>
          <div>
            <dt>Data e horário</dt>
            <dd>
              {formatDate(atendimento.data)}
              {atendimento.hora ? ` · ${atendimento.hora.slice(0, 5)}` : ""}
            </dd>
          </div>
          <div>
            <dt>Status atual</dt>
            <dd><Badge tone={estado.tone}>{estado.label}</Badge></dd>
          </div>
          <div><dt>Telefone</dt><dd>{atendimento.clienteTelefone || "—"}</dd></div>
          <div className="cu-detail-wide"><dt>Endereço</dt><dd>{endereco || "—"}</dd></div>
        </dl>

        {cancelado ? (
          <p className="payment-notice" role="status">
            {atendimento.naoRealizado
              ? `Atendimento não realizado. Motivo: ${atendimento.motivoNaoRealizado || "não informado"}.`
              : "Agendamento cancelado."}
            {atendimento.canceladoEm
              ? ` Registrado em ${formatDateTime(atendimento.canceladoEm)}.`
              : ""}
          </p>
        ) : !atendimento.ordemId ? (
          <p className="payment-notice" role="status">
            Este agendamento ainda não tem um serviço definido. Use a opção de
            editar para escolher o serviço e gerar a ordem de serviço.
          </p>
        ) : (
          <>
            <Timeline atendimento={atendimento} />

            {podeRegistrarPagamento(atendimento) ? (
              <Pagamento
                atendimento={atendimento}
                perfil={perfil}
                onPagamento={onPagamento}
              />
            ) : (
              <p className="payment-hint">
                O pagamento é registrado depois que o atendimento for iniciado.
              </p>
            )}

            <PecasExtras
              ordemId={atendimento.ordemId}
              ordemStatus={atendimento.ordemStatus}
              produtosAtivos={produtosAtivos}
              onConsumo={onConsumoPecaExtra}
            />
          </>
        )}
      </section>
    </div>
  );
}
