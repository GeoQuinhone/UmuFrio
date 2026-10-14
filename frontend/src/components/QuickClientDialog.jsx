import React, { useEffect, useRef, useState } from "react";
import { Field, TextInput, Select } from "./FormControls.jsx";
import { mascaraCpf, mascaraTelefone, mascaraCep, cpfValido } from "../utils/mascaras.js";
import "../pages/clients-users.css";

const FORM_VAZIO = {
  nome: "",
  cpf: "",
  telefone: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  tipoResidencia: "casa",
};

function somenteDigitos(valor) {
  return (valor || "").replace(/\D/g, "");
}

function dialogKeyDown(event, dialog, onClose) {
  if (event.key === "Escape") {
    event.preventDefault();
    onClose();
    return;
  }
  if (event.key !== "Tab" || !dialog) return;

  const focusable = Array.from(
    dialog.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.getAttribute("aria-hidden") !== "true");
  if (!focusable.length) {
    event.preventDefault();
    dialog.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (
    event.shiftKey &&
    (document.activeElement === first ||
      document.activeElement === dialog ||
      !dialog.contains(document.activeElement))
  ) {
    event.preventDefault();
    last.focus();
  } else if (
    !event.shiftKey &&
    (document.activeElement === last ||
      document.activeElement === dialog ||
      !dialog.contains(document.activeElement))
  ) {
    event.preventDefault();
    first.focus();
  }
}

// Cadastro rápido de cliente (pontos 1/16): permite criar um cliente sem
// sair da tela de Agendamentos, para o caso de ele ainda não ter cadastro.
export default function QuickClientDialog({ clientesExistentes = [], onClose, onCreate }) {
  const [form, setForm] = useState(FORM_VAZIO);
  const [errors, setErrors] = useState({});
  const [erroGeral, setErroGeral] = useState("");
  const [saving, setSaving] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
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

  async function buscarCep(valor) {
    const digits = somenteDigitos(valor);
    if (digits.length !== 8) return;

    setBuscandoCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await response.json();
      if (data.erro) return;

      setForm((current) => ({
        ...current,
        logradouro: data.logradouro || current.logradouro,
        bairro: data.bairro || current.bairro,
        cidade: data.localidade || current.cidade,
        estado: data.uf || current.estado,
      }));
    } catch {
      // Sem conexão com o serviço de CEP: o preenchimento continua manual.
    } finally {
      setBuscandoCep(false);
    }
  }

  function validar() {
    const novosErros = {};

    if (!form.nome.trim()) novosErros.nome = "Informe o nome.";

    if (!form.cpf.trim()) novosErros.cpf = "Informe o CPF.";
    else if (!cpfValido(form.cpf)) novosErros.cpf = "CPF inválido.";

    if (!novosErros.cpf) {
      const cpfDuplicado = clientesExistentes.some(
        (cliente) => somenteDigitos(cliente.cpf) === somenteDigitos(form.cpf),
      );
      if (cpfDuplicado) {
        novosErros.cpf = "Já existe um cliente cadastrado com este CPF.";
      }
    }

    if (!form.telefone.trim()) novosErros.telefone = "Informe o telefone.";

    if (somenteDigitos(form.cep).length !== 8) {
      novosErros.cep = "CEP deve possuir 8 dígitos.";
    }
    if (!form.logradouro.trim()) novosErros.logradouro = "Informe o logradouro.";
    if (!form.numero.trim()) novosErros.numero = "Informe o número.";
    if (!form.bairro.trim()) novosErros.bairro = "Informe o bairro.";
    if (!form.cidade.trim()) novosErros.cidade = "Informe a cidade.";
    if (!/^[A-Za-z]{2}$/.test(form.estado.trim())) {
      novosErros.estado = "UF com 2 letras.";
    }

    setErrors(novosErros);
    return Object.keys(novosErros).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!validar()) return;

    setSaving(true);
    setErroGeral("");

    try {
      const cliente = await onCreate({
        nome: form.nome.trim(),
        cpf: somenteDigitos(form.cpf),
        telefone: form.telefone.trim(),
        cep: somenteDigitos(form.cep),
        logradouro: form.logradouro.trim(),
        numero: form.numero.trim(),
        complemento: form.complemento.trim() || null,
        bairro: form.bairro.trim(),
        cidade: form.cidade.trim(),
        estado: form.estado.trim().toUpperCase(),
        tipoResidencia: form.tipoResidencia,
      });
      if (cliente) onClose();
    } catch (saveError) {
      setErroGeral(saveError.message);
    } finally {
      setSaving(false);
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
        aria-labelledby="quick-client-title"
        tabIndex="-1"
        onKeyDown={(event) => dialogKeyDown(event, dialogRef.current, onClose)}
      >
        <form onSubmit={handleSubmit}>
          <div className="cu-dialog-heading">
            <div>
              <span className="cu-eyebrow">NOVO CLIENTE</span>
              <h2 id="quick-client-title">Cadastrar cliente rapidamente</h2>
            </div>
            <button
              type="button"
              className="cu-dialog-close"
              data-dialog-initial-focus
              aria-label="Fechar"
              onClick={onClose}
            >
              ×
            </button>
          </div>

          {erroGeral && (
            <p className="catalog-form-error" role="alert">
              {erroGeral}
            </p>
          )}

          <div className="form-grid">
            <Field label="Nome" error={errors.nome}>
              <TextInput
                value={form.nome}
                onChange={(event) => setForm({ ...form, nome: event.target.value })}
                placeholder="Nome completo"
                autoFocus
              />
            </Field>
            <Field label="CPF" error={errors.cpf}>
              <TextInput
                value={form.cpf}
                onChange={(event) => setForm({ ...form, cpf: mascaraCpf(event.target.value) })}
                placeholder="000.000.000-00"
                inputMode="numeric"
              />
            </Field>
            <Field label="Telefone" error={errors.telefone}>
              <TextInput
                value={form.telefone}
                onChange={(event) => setForm({ ...form, telefone: mascaraTelefone(event.target.value) })}
                placeholder="(00) 00000-0000"
                inputMode="numeric"
              />
            </Field>
            <Field label={buscandoCep ? "CEP (buscando...)" : "CEP"} error={errors.cep}>
              <TextInput
                value={form.cep}
                onChange={(event) => setForm({ ...form, cep: mascaraCep(event.target.value) })}
                onBlur={(event) => buscarCep(event.target.value)}
                placeholder="00000-000"
                inputMode="numeric"
              />
            </Field>
            <Field label="Logradouro" error={errors.logradouro}>
              <TextInput
                value={form.logradouro}
                onChange={(event) => setForm({ ...form, logradouro: event.target.value })}
                placeholder="Rua, avenida..."
              />
            </Field>
            <Field label="Número" error={errors.numero}>
              <TextInput
                value={form.numero}
                onChange={(event) => setForm({ ...form, numero: event.target.value })}
                placeholder="Nº"
              />
            </Field>
            <Field label="Complemento (opcional)">
              <TextInput
                value={form.complemento}
                onChange={(event) => setForm({ ...form, complemento: event.target.value })}
                placeholder="Bloco, fundos..."
              />
            </Field>
            <Field label="Bairro" error={errors.bairro}>
              <TextInput
                value={form.bairro}
                onChange={(event) => setForm({ ...form, bairro: event.target.value })}
              />
            </Field>
            <Field label="Cidade" error={errors.cidade}>
              <TextInput
                value={form.cidade}
                onChange={(event) => setForm({ ...form, cidade: event.target.value })}
              />
            </Field>
            <Field label="UF" error={errors.estado}>
              <TextInput
                value={form.estado}
                onChange={(event) => setForm({ ...form, estado: event.target.value.toUpperCase() })}
                placeholder="PR"
                maxLength={2}
              />
            </Field>
            <Field label="Tipo de residência">
              <Select
                value={form.tipoResidencia}
                onChange={(event) => setForm({ ...form, tipoResidencia: event.target.value })}
              >
                <option value="casa">Casa</option>
                <option value="apartamento">Apartamento</option>
                <option value="barracao">Barracão</option>
              </Select>
            </Field>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Salvando..." : "Cadastrar e selecionar"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
