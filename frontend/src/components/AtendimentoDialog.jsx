import React, { useEffect, useRef, useState } from "react";

import CheckinPanel from "./CheckinPanel.jsx";
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
  linkLigacao,
  linkWhatsappCliente,
  osCode,
  podeRegistrarPagamento,
  valorDoAtendimento,
} from "../utils/atendimento.js";
import ProdutoSelect from "./ProdutoSelect.jsx";
import { useAuth } from "../AuthContext.jsx";
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
function PecasExtras({ ordemId, ordemStatus, pago, produtosAtivos, onConsumo, somenteLeitura = false }) {
  const [pecas, setPecas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [produtoId, setProdutoId] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [erro, setErro] = useState("");
  const [sucessoPeca, setSucessoPeca] = useState("");
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
    setSucessoPeca("");
    try {
      await apiRequest(`/ordens-servico/${ordemId}/pecas-extras`, {
        method: "POST",
        body: JSON.stringify({ produtoId: Number(produtoId), quantidade: quantidadeNumerica }),
      });
      setProdutoId("");
      setQuantidade("1");
      await carregar();
      setSucessoPeca("Peça extra lançada e descontada do estoque.");
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
              <span>{peca.quantidade}x {peca.produtoNome}</span>
              {peca.valorUnitario !== null && peca.valorUnitario !== undefined && (
                <strong>{formatMoeda(Number(peca.valorUnitario) * peca.quantidade)}</strong>
              )}
            </li>
          ))}
        </ul>
      )}

      {ordemStatus === "andamento" && pago && (
        <p className="os-extra-parts-empty">
          Pagamento confirmado: não é mais possível adicionar peças extras.
        </p>
      )}

      {ordemStatus === "andamento" && !pago && !somenteLeitura && (
        <form className="os-extra-parts-form" onSubmit={registrarConsumo}>
          {erro && <p className="catalog-form-error os-extra-parts-error" role="alert">{erro}</p>}
          {sucessoPeca && <p className="success-banner" role="status">{sucessoPeca}</p>}
          <Field label="Peça">
            <ProdutoSelect
              produtos={produtosAtivos}
              value={produtoId}
              onChange={setProdutoId}
              mostrarMinimo={false}
              exigirSaldo
            />
          </Field>
          <Field label="Quantidade">
            <TextInput
              type="number"
              min="1"
              step="1"
              value={quantidade}
              onChange={(event) => setQuantidade(event.target.value.replace(/^0+(?=\d)/, ""))}
            />
          </Field>
          <button type="submit" className="btn-ghost os-extra-parts-submit" disabled={salvando}>
            {salvando ? "Descontando..." : "Descontar do estoque"}
          </button>
          <p className="os-extra-parts-hint">O valor das peças extras é somado ao pagamento do atendimento.</p>
        </form>
      )}
    </div>
  );
}

function Pagamento({ atendimento, perfil, onPagamento }) {
  const confirmado = Boolean(atendimento.pagamentoConfirmado);
  // Fase 8: depois de pago, só o CEO vê o botão de alterar (o técnico e os demais
  // perfis apenas consultam o resumo).
  const podeAlterar = !confirmado || perfil === "ceo";
  const extras = Number(atendimento.extrasValor ?? 0);

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
          <dd>{formatMoeda(valorDoAtendimento(atendimento))}</dd>
        </div>
        {extras > 0 && (
          <div>
            <dt>Inclui peças extras</dt>
            <dd>{formatMoeda(extras)}</dd>
          </div>
        )}
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
        {atendimento.observacaoPagamento &&
          (String(atendimento.observacaoPagamento).startsWith("Pagamento pendente:") ? (
            // Fase 11: motivo da pendência em destaque (some quando for pago).
            <div className="payment-summary-wide pendencia-motivo">
              <dt>Pagamento pendente · motivo</dt>
              <dd>
                {String(atendimento.observacaoPagamento)
                  .replace("Pagamento pendente:", "")
                  .split(" | ")[0]
                  .trim()}
              </dd>
            </div>
          ) : (
            <div className="payment-summary-wide">
              <dt>Observação</dt>
              <dd>{atendimento.observacaoPagamento}</dd>
            </div>
          ))}
      </dl>

      {/* Fase 11: sem onPagamento (ex.: aberto pelos relatórios) é só consulta. */}
      {!onPagamento ? null : podeAlterar ? (
        <button type="button" className="btn-ghost" onClick={onPagamento}>
          <Icon name="wallet" size={15} />
          {/* Fase 11: em andamento, receber o pagamento já conclui o atendimento. */}
          {confirmado
            ? "Alterar pagamento"
            : atendimento.ordemStatus === "andamento"
              ? "Receber e concluir"
              : "Registrar pagamento"}
        </button>
      ) : (
        <p className="payment-hint">
          Pagamento confirmado. Somente o CEO pode alterá-lo.
        </p>
      )}
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
  // Fase 11: aberto pelos relatórios, só para consulta (sem lançar peças/pagar).
  somenteLeitura = false,
}) {
  const dialogRef = useRef(null);
  const { user } = useAuth();

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
            <dt>Veículo</dt>
            <dd>
              {atendimento.veiculoPlaca
                ? `${atendimento.veiculoMarca} ${atendimento.veiculoModelo} · ${atendimento.veiculoPlaca}`
                : "Sem veículo ativo"}
            </dd>
          </div>
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
          <div>
            <dt>Telefone</dt>
            <dd className="cu-phone">
              <span>{atendimento.clienteTelefone || "—"}</span>
              {!cancelado && linkLigacao(atendimento.clienteTelefone) && (
                <a className="cu-contact-btn" href={linkLigacao(atendimento.clienteTelefone)} aria-label={`Ligar para ${atendimento.clienteNome}`}>
                  Ligar
                </a>
              )}
              {!cancelado && linkWhatsappCliente(atendimento, user?.nome) && (
                <a
                  className="cu-contact-btn cu-contact-whats"
                  href={linkWhatsappCliente(atendimento, user?.nome)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Chamar ${atendimento.clienteNome} no WhatsApp`}
                >
                  <Icon name="whatsapp" size={13} /> WhatsApp
                </a>
              )}
            </dd>
          </div>
          <div className="cu-detail-wide"><dt>Endereço</dt><dd>{endereco || "—"}</dd></div>
        </dl>

        {cancelado ? (
          <div className="payment-notice" role="status">
            {atendimento.naoRealizado ? "Atendimento não realizado." : "Agendamento cancelado."}
            {atendimento.canceladoEm
              ? ` Registrado em ${formatDateTime(atendimento.canceladoEm)}.`
              : ""}
            {/* Fase 11: o motivo em destaque, para ler de bate-pronto.
                Boolean(): naoRealizado vem do banco como 0/1, e um 0 solto
                apareceria escrito na tela. */}
            {Boolean(atendimento.naoRealizado) ? (
              <p className="nao-realizado-motivo">
                <strong>Motivo:</strong> {atendimento.motivoNaoRealizado || "não informado"}
              </p>
            ) : (
              <p className="nao-realizado-motivo">
                <strong>Cancelado</strong> pela empresa antes da visita (o cliente desistiu ou remarcou).
              </p>
            )}
          </div>
        ) : !atendimento.ordemId ? (
          <p className="payment-notice" role="status">
            Este agendamento ainda não tem um serviço definido. Use a opção de
            editar para escolher o serviço e gerar a ordem de serviço.
          </p>
        ) : (
          <>
            <Timeline atendimento={atendimento} />

            {/* Fase 11: aviso antecipado para resolver a peça antes de ir ao cliente. */}
            {atendimento.ordemStatus === "aberta" && atendimento.pecasFaltando?.length > 0 && (
              <div className="os-falta-peca" role="status">
                <strong>Falta peça no estoque para este atendimento:</strong>
                <ul>
                  {atendimento.pecasFaltando.map((peca) => (
                    <li key={peca.nome}>
                      {peca.nome}: precisa {peca.necessario}, há {peca.saldo}
                    </li>
                  ))}
                </ul>
                <small>
                  Resolva antes de sair (estoquista confere o saldo ou a peça é comprada). Se ainda faltar, dá para
                  iniciar mesmo assim informando o motivo.
                </small>
              </div>
            )}

            <CheckinPanel
              ordemId={atendimento.ordemId}
              ordemStatus={atendimento.ordemStatus}
            />

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
              pago={Boolean(atendimento.pagamentoConfirmado)}
              produtosAtivos={produtosAtivos}
              onConsumo={onConsumoPecaExtra}
              somenteLeitura={somenteLeitura}
            />
          </>
        )}
      </section>
    </div>
  );
}
