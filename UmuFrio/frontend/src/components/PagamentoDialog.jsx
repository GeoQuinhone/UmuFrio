import React, { useEffect, useRef, useState } from "react";

import { Field, Select, TextInput } from "./FormControls.jsx";
import { dialogKeyDown } from "./dialogUtils.js";
import { mascaraMoeda, moedaParaNumero } from "../utils/mascaras.js";
import {
  FORMAS_PAGAMENTO,
  formatDateTime,
  formatMoeda,
  osCode,
} from "../utils/atendimento.js";
import "../pages/clients-users.css";
import "./order-details.css";

function paraCampoMoeda(valor) {
  if (valor === null || valor === undefined || valor === "") return "";
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return "";
  return mascaraMoeda(String(Math.round(numero * 100)));
}

// Pagamento do atendimento (pontos 11 e 17): valor cobrado (pode ser
// diferente do valor do serviço), forma de pagamento, confirmação e a
// observação com o motivo quando o valor muda. Depois de confirmado, só o CEO
// consegue alterar.
export default function PagamentoDialog({
  atendimento,
  perfil,
  onSave,
  onClose,
}) {
  const dialogRef = useRef(null);

  const confirmadoAntes = Boolean(atendimento.pagamentoConfirmado);
  const somenteLeitura = confirmadoAntes && perfil !== "ceo";
  const valorServico = Number(atendimento.servicoValor ?? 0);

  const [valor, setValor] = useState(
    paraCampoMoeda(atendimento.valorCobrado ?? atendimento.servicoValor),
  );
  const [forma, setForma] = useState(atendimento.formaPagamento || "");
  const [confirmado, setConfirmado] = useState(confirmadoAntes);
  const [observacao, setObservacao] = useState(
    atendimento.observacaoPagamento || "",
  );
  const [erros, setErros] = useState({});
  const [erroGeral, setErroGeral] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const returnFocusTo = document.activeElement;
    dialogRef.current?.querySelector("[data-dialog-initial-focus]")?.focus();
    return () => {
      if (returnFocusTo?.isConnected && typeof returnFocusTo.focus === "function") {
        returnFocusTo.focus();
      }
    };
  }, []);

  const valorNumero = moedaParaNumero(valor);
  const diferenca = Math.round(valorNumero * 100) - Math.round(valorServico * 100);
  const valorDiferente = valor !== "" && diferenca !== 0;

  async function salvar(event) {
    event.preventDefault();
    if (somenteLeitura) return;

    const novosErros = {};

    if (valor === "") {
      novosErros.valor = "Informe o valor cobrado.";
    }
    if (valorDiferente && !observacao.trim()) {
      novosErros.observacao =
        diferenca > 0
          ? "Informe o motivo da cobrança a mais."
          : "Informe o motivo do valor menor que o do serviço.";
    }
    if (confirmado && !forma) {
      novosErros.forma = "Informe a forma de pagamento para confirmar.";
    }

    setErros(novosErros);
    setErroGeral("");
    if (Object.keys(novosErros).length > 0) return;

    setSalvando(true);
    try {
      await onSave({
        valorCobrado: valorNumero,
        formaPagamento: forma || null,
        pagamentoConfirmado: confirmado,
        observacaoPagamento: observacao.trim() || null,
      });
      onClose();
    } catch (saveError) {
      setErroGeral(saveError.message);
    } finally {
      setSalvando(false);
    }
  }

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
        aria-labelledby="pagamento-dialog-title"
        tabIndex="-1"
        onKeyDown={(event) => dialogKeyDown(event, dialogRef.current, onClose)}
      >
        <form onSubmit={salvar} noValidate>
          <div className="cu-dialog-heading">
            <div>
              <span className="cu-eyebrow">PAGAMENTO</span>
              <h2 id="pagamento-dialog-title">
                {atendimento.ordemId ? osCode(atendimento.ordemId) : "Atendimento"}
                {" · "}
                {atendimento.clienteNome}
              </h2>
            </div>
            <button
              type="button"
              className="cu-dialog-close"
              data-dialog-initial-focus
              aria-label="Fechar pagamento"
              onClick={onClose}
            >
              ×
            </button>
          </div>

          <p className="payment-reference">
            {atendimento.servicoNome} · valor do serviço{" "}
            <strong>{formatMoeda(atendimento.servicoValor)}</strong>
          </p>

          {somenteLeitura && (
            <p className="payment-notice" role="status">
              Pagamento confirmado
              {atendimento.pagamentoConfirmadoEm
                ? ` em ${formatDateTime(atendimento.pagamentoConfirmadoEm)}`
                : ""}
              . Depois de confirmado, somente o CEO pode alterá-lo.
            </p>
          )}

          {erroGeral && (
            <p className="catalog-form-error" role="alert">
              {erroGeral}
            </p>
          )}

          <div className="form-grid">
            <Field
              label="Valor cobrado (R$)"
              error={erros.valor}
              hint={
                valorDiferente
                  ? diferenca > 0
                    ? `${formatMoeda(diferenca / 100)} acima do valor do serviço.`
                    : `${formatMoeda(Math.abs(diferenca) / 100)} abaixo do valor do serviço.`
                  : undefined
              }
            >
              <TextInput
                value={valor}
                onChange={(event) => {
                  setValor(mascaraMoeda(event.target.value));
                  setErros((atuais) => ({ ...atuais, valor: undefined, observacao: undefined }));
                }}
                inputMode="numeric"
                placeholder="0,00"
                disabled={somenteLeitura}
              />
            </Field>

            <Field label="Forma de pagamento" error={erros.forma}>
              <Select
                value={forma}
                onChange={(event) => {
                  setForma(event.target.value);
                  setErros((atuais) => ({ ...atuais, forma: undefined }));
                }}
                disabled={somenteLeitura}
              >
                <option value="">Selecione...</option>
                {FORMAS_PAGAMENTO.map((opcao) => (
                  <option key={opcao.value} value={opcao.value}>
                    {opcao.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            label={
              valorDiferente
                ? "Observação (motivo da diferença de valor)"
                : "Observação (opcional)"
            }
            error={erros.observacao}
          >
            <textarea
              className="input payment-observation"
              rows={3}
              maxLength={255}
              value={observacao}
              onChange={(event) => {
                setObservacao(event.target.value);
                setErros((atuais) => ({ ...atuais, observacao: undefined }));
              }}
              placeholder={
                valorDiferente
                  ? "Ex.: peça adicional, deslocamento, desconto combinado..."
                  : "Alguma informação sobre a cobrança"
              }
              disabled={somenteLeitura}
            />
          </Field>

          <label className="payment-confirm">
            <input
              type="checkbox"
              checked={confirmado}
              onChange={(event) => setConfirmado(event.target.checked)}
              disabled={somenteLeitura}
            />
            <span>
              <strong>Pagamento recebido e confirmado</strong>
              <small>Marque somente depois de receber o valor do cliente.</small>
            </span>
          </label>

          <div className="form-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              {somenteLeitura ? "Fechar" : "Cancelar"}
            </button>
            {!somenteLeitura && (
              <button type="submit" className="btn-primary" disabled={salvando}>
                {salvando ? "Salvando..." : "Salvar pagamento"}
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
