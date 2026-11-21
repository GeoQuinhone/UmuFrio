import React, { useEffect, useRef, useState } from "react";

import { Field, Select, TextInput } from "./FormControls.jsx";
import PixPanel from "./PixPanel.jsx";
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

// Fase 11: motivos prontos para acréscimo e desconto (o texto escolhido vai
// para a observação do pagamento; "Outro" exige descrever).
const MOTIVOS = {
  acrescimo: [
    "Deslocamento",
    "Peça ou material avulso",
    "Serviço adicional no local",
    "Outro",
  ],
  desconto: [
    "Desconto combinado com o cliente",
    "Cliente recorrente",
    "Serviço feito em parte",
    "Outro",
  ],
};

// Fase 11: "Pagamento pendente: motivo | resto" -> { pendencia, resto }.
const PREFIXO_PENDENTE = "Pagamento pendente:";
function separarPendencia(observacao) {
  const texto = String(observacao || "").trim();
  if (!texto.startsWith(PREFIXO_PENDENTE)) return { pendencia: "", resto: texto };
  const [primeira, ...outras] = texto.split(" | ");
  return { pendencia: primeira.slice(PREFIXO_PENDENTE.length).trim(), resto: outras.join(" | ") };
}

// Lê uma observação já gravada ("Motivo: detalhe") de volta para os campos.
function lerMotivo(tipo, observacao) {
  const texto = separarPendencia(observacao).resto;
  const motivo = MOTIVOS[tipo].find((m) => m !== "Outro" && texto.startsWith(m));
  if (!motivo) return { motivo: texto ? "Outro" : "", detalhe: texto };
  return { motivo, detalhe: texto.slice(motivo.length).replace(/^[:\s.-]+/, "") };
}

// Pagamento do atendimento. O total a receber é calculado sozinho (serviço +
// peças extras). Para cobrar diferente, o técnico abre "Acréscimo ou
// desconto", informa o valor e escolhe o motivo. Depois de confirmado, só o
// CEO consegue alterar.
export default function PagamentoDialog({
  atendimento,
  perfil,
  onSave,
  onPagamentoConfirmado,
  onClose,
}) {
  const dialogRef = useRef(null);

  const [pixAprovado, setPixAprovado] = useState(false);
  const confirmadoAntes = Boolean(atendimento.pagamentoConfirmado) || pixAprovado;
  const somenteLeitura = confirmadoAntes && perfil !== "ceo";

  const valorServicoTabela = Number(atendimento.servicoValor ?? 0);
  const valorExtras = Number(atendimento.extrasValor ?? 0);
  const totalCentavos = Math.round((valorServicoTabela + valorExtras) * 100);

  // Valor já gravado: vira acréscimo/desconto. Um valor antigo sem motivo e
  // ainda não confirmado (gravado antes de lançar peças) é ignorado.
  const { pendencia } = separarPendencia(atendimento.observacaoPagamento);
  const [inicial] = useState(() => {
    const gravado = atendimento.valorCobrado;
    const temGravado = gravado !== null && gravado !== undefined && gravado !== "";
    const usarGravado =
      temGravado && (atendimento.pagamentoConfirmado || atendimento.observacaoPagamento);
    const diferenca = usarGravado ? Math.round(Number(gravado) * 100) - totalCentavos : 0;
    if (diferenca === 0) {
      return { aberto: false, tipo: "acrescimo", valor: "", motivo: "", detalhe: "", nota: separarPendencia(atendimento.observacaoPagamento).resto };
    }
    const tipo = diferenca > 0 ? "acrescimo" : "desconto";
    return {
      aberto: true,
      tipo,
      valor: paraCampoMoeda(Math.abs(diferenca) / 100),
      ...lerMotivo(tipo, atendimento.observacaoPagamento),
      nota: "",
    };
  });

  const [ajusteAberto, setAjusteAberto] = useState(inicial.aberto);
  const [tipoAjuste, setTipoAjuste] = useState(inicial.tipo);
  const [valorAjuste, setValorAjuste] = useState(inicial.valor);
  const [motivo, setMotivo] = useState(inicial.motivo);
  const [detalhe, setDetalhe] = useState(inicial.detalhe);
  const [nota, setNota] = useState(inicial.nota);
  const [forma, setForma] = useState(atendimento.formaPagamento || "");
  const [confirmado, setConfirmado] = useState(confirmadoAntes);
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

  const ajusteCentavos = ajusteAberto && valorAjuste !== ""
    ? Math.round(moedaParaNumero(valorAjuste) * 100)
    : 0;
  const sinal = tipoAjuste === "desconto" ? -1 : 1;
  const receberCentavos = totalCentavos + sinal * ajusteCentavos;
  const valorNumero = receberCentavos / 100;
  const temAjuste = ajusteAberto && ajusteCentavos > 0;

  function textoDaCobranca() {
    if (!temAjuste) return nota.trim();
    const extra = detalhe.trim();
    if (motivo === "Outro") return extra;
    return extra ? `${motivo}: ${extra}` : motivo;
  }

  // Fase 11: pago, o "Pagamento pendente" sai da observação; ainda sem
  // confirmar (ex.: gerando o PIX), ele continua guardado.
  function observacaoFinal(confirmando) {
    const texto = textoDaCobranca();
    if (confirmando || !pendencia) return texto || null;
    return [`${PREFIXO_PENDENTE} ${pendencia}`, texto].filter(Boolean).join(" | ").slice(0, 255);
  }

  function limparErro(...campos) {
    setErros((atuais) => {
      const novos = { ...atuais };
      for (const campo of campos) delete novos[campo];
      return novos;
    });
  }

  // Validação comum ao "Salvar pagamento" e ao "Gerar PIX".
  function validar(exigirConfirmacao = true) {
    const novosErros = {};

    if (ajusteAberto) {
      if (ajusteCentavos <= 0) {
        novosErros.valorAjuste =
          tipoAjuste === "desconto" ? "Informe o valor do desconto." : "Informe o valor do acréscimo.";
      } else if (tipoAjuste === "desconto" && ajusteCentavos > totalCentavos) {
        novosErros.valorAjuste = "O desconto não pode ser maior que o total.";
      }
      if (!motivo) {
        novosErros.motivo = "Escolha o motivo.";
      } else if (motivo === "Outro" && detalhe.trim().length < 10) {
        novosErros.detalhe = "Descreva o motivo (mínimo de 10 caracteres).";
      }
    }
    if (exigirConfirmacao && confirmado && !forma) {
      novosErros.forma = "Informe a forma de pagamento para confirmar.";
    }

    setErros(novosErros);
    setErroGeral("");
    return Object.keys(novosErros).length === 0;
  }

  // Grava valor/observação com forma PIX (ainda não confirmado) antes de gerar
  // a cobrança: o servidor cobra exatamente o valor gravado.
  async function prepararPix() {
    if (!validar(false)) {
      throw new Error("Corrija os campos destacados antes de gerar o PIX.");
    }
    await onSave({
      valorCobrado: valorNumero,
      formaPagamento: "pix",
      pagamentoConfirmado: false,
      observacaoPagamento: observacaoFinal(false),
    });
  }

  function aoAprovarPix() {
    setConfirmado(true);
    setForma("pix");
    setPixAprovado(true);
    onPagamentoConfirmado?.();
  }

  async function salvar(event) {
    event.preventDefault();
    if (somenteLeitura) return;
    if (!validar()) return;

    setSalvando(true);
    try {
      await onSave({
        valorCobrado: valorNumero,
        formaPagamento: forma || null,
        pagamentoConfirmado: confirmado,
        observacaoPagamento: observacaoFinal(confirmado),
      });
      onClose();
    } catch (saveError) {
      setErroGeral(saveError.message);
    } finally {
      setSalvando(false);
    }
  }

  function removerAjuste() {
    setAjusteAberto(false);
    setValorAjuste("");
    setMotivo("");
    setDetalhe("");
    limparErro("valorAjuste", "motivo", "detalhe");
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

          {/* Resumo: o total se monta sozinho com as peças lançadas. */}
          <dl className="pagamento-resumo" aria-label="Resumo da cobrança">
            <div>
              <dt>{atendimento.servicoNome || "Serviço"}</dt>
              <dd>{formatMoeda(valorServicoTabela)}</dd>
            </div>
            {valorExtras > 0 && (
              <div>
                <dt>Peças extras</dt>
                <dd>+ {formatMoeda(valorExtras)}</dd>
              </div>
            )}
            {temAjuste && (
              <div className={tipoAjuste === "desconto" ? "pagamento-resumo-desconto" : "pagamento-resumo-acrescimo"}>
                <dt>{tipoAjuste === "desconto" ? "Desconto" : "Acréscimo"}{motivo && motivo !== "Outro" ? ` · ${motivo}` : ""}</dt>
                <dd>{tipoAjuste === "desconto" ? "− " : "+ "}{formatMoeda(ajusteCentavos / 100)}</dd>
              </div>
            )}
            <div className="pagamento-resumo-total">
              <dt>Total a receber</dt>
              <dd>{formatMoeda(valorNumero)}</dd>
            </div>
          </dl>

          {somenteLeitura && (
            <p className="payment-notice" role="status">
              Pagamento confirmado
              {atendimento.pagamentoConfirmadoEm
                ? ` em ${formatDateTime(atendimento.pagamentoConfirmadoEm)}`
                : ""}
              . Depois de confirmado, somente o CEO pode alterá-lo.
            </p>
          )}

          {pendencia && !confirmadoAntes && (
            <p className="payment-notice" role="status">
              Pagamento ficou pendente na conclusão. Motivo: {pendencia}
            </p>
          )}

          {erroGeral && (
            <p className="catalog-form-error" role="alert">
              {erroGeral}
            </p>
          )}

          {!ajusteAberto && !somenteLeitura && (
            <button
              type="button"
              className="btn-ghost pagamento-ajuste-abrir"
              onClick={() => setAjusteAberto(true)}
            >
              + Acréscimo ou desconto
            </button>
          )}

          {ajusteAberto && (
            <fieldset className="pagamento-ajuste" disabled={somenteLeitura}>
              <legend>Acréscimo ou desconto</legend>

              <div className="pagamento-ajuste-tipo" role="radiogroup" aria-label="Tipo de ajuste">
                {[
                  ["acrescimo", "Acréscimo"],
                  ["desconto", "Desconto"],
                ].map(([valorTipo, rotulo]) => (
                  <label key={valorTipo} className={tipoAjuste === valorTipo ? "ativo" : ""}>
                    <input
                      type="radio"
                      name="tipo-ajuste"
                      value={valorTipo}
                      checked={tipoAjuste === valorTipo}
                      onChange={() => {
                        setTipoAjuste(valorTipo);
                        setMotivo("");
                        limparErro("valorAjuste", "motivo", "detalhe");
                      }}
                    />
                    {rotulo}
                  </label>
                ))}
              </div>

              <div className="form-grid">
                <Field label="Valor (R$)" error={erros.valorAjuste}>
                  <TextInput
                    value={valorAjuste}
                    onChange={(event) => {
                      setValorAjuste(mascaraMoeda(event.target.value));
                      limparErro("valorAjuste");
                    }}
                    inputMode="numeric"
                    placeholder="0,00"
                  />
                </Field>

                <Field label="Motivo" error={erros.motivo}>
                  <Select
                    value={motivo}
                    onChange={(event) => {
                      setMotivo(event.target.value);
                      limparErro("motivo", "detalhe");
                    }}
                  >
                    <option value="">Selecione...</option>
                    {MOTIVOS[tipoAjuste].map((opcao) => (
                      <option key={opcao} value={opcao}>
                        {opcao}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field
                label={motivo === "Outro" ? "Descreva o motivo" : "Detalhes (opcional)"}
                error={erros.detalhe}
              >
                <textarea
                  className="input payment-observation"
                  rows={2}
                  maxLength={200}
                  value={detalhe}
                  onChange={(event) => {
                    setDetalhe(event.target.value);
                    limparErro("detalhe");
                  }}
                  placeholder="Ex.: troca do capacitor do ventilador, combinado com o cliente"
                />
              </Field>

              {!somenteLeitura && (
                <button type="button" className="btn-ghost pagamento-ajuste-remover" onClick={removerAjuste}>
                  Remover acréscimo/desconto
                </button>
              )}
            </fieldset>
          )}

          <Field label="Forma de pagamento" error={erros.forma}>
            <Select
              value={forma}
              onChange={(event) => {
                setForma(event.target.value);
                limparErro("forma");
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

          {!temAjuste && (
            <Field label="Observação (opcional)">
              <textarea
                className="input payment-observation"
                rows={2}
                maxLength={255}
                value={nota}
                onChange={(event) => setNota(event.target.value)}
                placeholder="Alguma informação sobre a cobrança"
                disabled={somenteLeitura}
              />
            </Field>
          )}

          {forma === "pix" &&
            atendimento.ordemId &&
            (pixAprovado || !confirmadoAntes) && (
              <PixPanel
                ordemId={atendimento.ordemId}
                valorAtual={valorNumero}
                preparar={prepararPix}
                onAprovado={aoAprovarPix}
              />
            )}

          <label className="payment-confirm">
            <input
              type="checkbox"
              checked={confirmado}
              onChange={(event) => setConfirmado(event.target.checked)}
              disabled={somenteLeitura}
            />
            <span>
              <strong>Recebi {formatMoeda(valorNumero)} do cliente</strong>
              <small>Marque somente depois de receber o valor.</small>
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
