import React, { useState } from "react";
import Layout from "../components/Layout.jsx";
import { Field, TextInput, Badge, EmptyState, ErrorBanner } from "../components/FormControls.jsx";

const emptyForm = { nome: "", cpf: "", telefone: "", endereco: "" };

function onlyDigits(s) {
  return (s || "").replace(/\D/g, "");
}

export default function Clientes({ crud, agendamentos, onBack }) {
  const { items, loading, error, add, update, remove, action } = crud;
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState("");
  const [saving, setSaving] = useState(false);

  function startNew() {
    setForm(emptyForm);
    setEditingId(null);
    setErrors({});
    setShowForm(true);
  }

  function startEdit(cliente) {
    setForm({ nome: cliente.nome, cpf: cliente.cpf, telefone: cliente.telefone, endereco: cliente.endereco });
    setEditingId(cliente.id);
    setErrors({});
    setShowForm(true);
  }

  function validate() {
    const e = {};
    if (!form.nome.trim()) e.nome = "Informe o nome.";
    if (!form.cpf.trim()) e.cpf = "Informe o CPF.";
    else if (onlyDigits(form.cpf).length !== 11) e.cpf = "CPF deve ter 11 dígitos.";
    if (!form.telefone.trim()) e.telefone = "Informe o telefone.";
    if (!form.endereco.trim()) e.endereco = "Informe o endereço.";

    // checagem local (feedback imediato) — o backend confere de novo com autoridade
    if (!e.cpf) {
      const cpfDigits = onlyDigits(form.cpf);
      const duplicado = items.some((c) => onlyDigits(c.cpf) === cpfDigits && c.id !== editingId);
      if (duplicado) e.cpf = "Já existe um cliente cadastrado com este CPF.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      if (editingId) {
        await update(editingId, { nome: form.nome, telefone: form.telefone, endereco: form.endereco });
      } else {
        await add(form);
      }
      setShowForm(false);
      setForm(emptyForm);
      setEditingId(null);
      setBanner("");
    } catch (e) {
      setBanner(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleInativar(cliente) {
    try {
      await action(cliente.id, "/status");
      setBanner("");
    } catch (e) {
      setBanner(e.message);
    }
  }

  async function handleRemove(cliente) {
    if (!window.confirm(`Remover o cliente "${cliente.nome}"? Essa ação é definitiva.`)) return;
    try {
      await remove(cliente.id);
    } catch (e) {
      setBanner(e.message);
    }
  }

  return (
    <Layout title="Clientes" subtitle="Cadastrar, editar e inativar clientes." onBack={onBack}>
      <ErrorBanner message={error || banner} onClose={() => setBanner("")} />

      <div className="toolbar">
        <button className="btn-primary" onClick={startNew}>
          + Novo cliente
        </button>
      </div>

      {showForm && (
        <form className="form-card" onSubmit={handleSubmit}>
          <h3>{editingId ? "Editar cliente" : "Novo cliente"}</h3>
          <div className="form-grid">
            <Field label="Nome" error={errors.nome}>
              <TextInput value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Nome completo" />
            </Field>
            <Field label="CPF" error={errors.cpf}>
              <TextInput
                value={form.cpf}
                onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                placeholder="000.000.000-00"
                disabled={Boolean(editingId)}
              />
            </Field>
            <Field label="Telefone" error={errors.telefone}>
              <TextInput value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="(00) 00000-0000" />
            </Field>
            <Field label="Endereço" error={errors.endereco}>
              <TextInput value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} placeholder="Rua, número, CEP" />
            </Field>
          </div>
          <div className="form-actions">
            <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <EmptyState text="Carregando clientes..." />
      ) : items.length === 0 ? (
        <EmptyState text="Nenhum cliente cadastrado ainda." />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>CPF</th>
              <th>Telefone</th>
              <th>Endereço</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td>{c.nome}</td>
                <td>{c.cpf}</td>
                <td>{c.telefone}</td>
                <td>{c.endereco}</td>
                <td>
                  <Badge tone={c.status === "ativo" ? "green" : "grey"}>{c.status}</Badge>
                </td>
                <td className="row-actions">
                  <button className="btn-link" onClick={() => startEdit(c)}>
                    Editar
                  </button>
                  <button className="btn-link" onClick={() => handleInativar(c)}>
                    {c.status === "ativo" ? "Inativar" : "Reativar"}
                  </button>
                  <button className="btn-link btn-link-danger" onClick={() => handleRemove(c)}>
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Layout>
  );
}
