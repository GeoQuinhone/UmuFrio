import React, { useState } from "react";
import Layout from "../components/Layout.jsx";
import { Field, TextInput, Select, Badge, EmptyState, ErrorBanner } from "../components/FormControls.jsx";

const emptyForm = { nome: "", email: "", telefone: "", perfil: "atendente", senha: "" };
const PERFIL_LABEL = { ceo: "CEO", atendente: "Atendente", estoquista: "Estoquista", tecnico: "Técnico" };

export default function Usuarios({ crud, onBack }) {
  const { items, loading, error, add, update, remove } = crud;
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

  function startEdit(usuario) {
    setForm({ nome: usuario.nome, email: usuario.email, telefone: usuario.telefone, perfil: usuario.perfil, senha: "" });
    setEditingId(usuario.id);
    setErrors({});
    setShowForm(true);
  }

  function validate() {
    const e = {};
    if (!form.nome.trim()) e.nome = "Informe o nome.";
    if (!form.email.trim()) e.email = "Informe o e-mail.";
    else if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = "E-mail inválido.";
    if (!form.telefone.trim()) e.telefone = "Informe o telefone.";

    if (!e.email) {
      const duplicado = items.some((u) => u.email.toLowerCase() === form.email.trim().toLowerCase() && u.id !== editingId);
      if (duplicado) e.email = "Já existe um usuário com este e-mail.";
    }
    if (!editingId || form.senha) {
      if (form.senha.length < 6) e.senha = "A senha deve ter no mínimo 6 caracteres.";
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
        const patch = { nome: form.nome, telefone: form.telefone, perfil: form.perfil };
        if (form.senha) patch.senha = form.senha;
        await update(editingId, patch);
      } else {
        await add({ nome: form.nome, email: form.email, telefone: form.telefone, perfil: form.perfil, senha: form.senha });
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

  async function handleRemove(usuario) {
    if (!window.confirm(`Remover o usuário "${usuario.nome}"?`)) return;
    try {
      await remove(usuario.id);
    } catch (e) {
      setBanner(e.message);
    }
  }

  return (
    <Layout title="Usuários e Técnicos" subtitle="Cadastrar usuários e definir perfis de acesso." onBack={onBack}>
      <ErrorBanner message={error || banner} onClose={() => setBanner("")} />

      <div className="toolbar">
        <button className="btn-primary" onClick={startNew}>
          + Novo usuário
        </button>
      </div>

      {showForm && (
        <form className="form-card" onSubmit={handleSubmit}>
          <h3>{editingId ? "Editar usuário" : "Novo usuário"}</h3>
          <div className="form-grid">
            <Field label="Nome" error={errors.nome}>
              <TextInput value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Nome completo" />
            </Field>
            <Field label="E-mail" error={errors.email}>
              <TextInput
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="nome@empresa.com"
                disabled={Boolean(editingId)}
              />
            </Field>
            <Field label="Telefone" error={errors.telefone}>
              <TextInput value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="(00) 00000-0000" />
            </Field>
            <Field label="Perfil de acesso">
              <Select value={form.perfil} onChange={(e) => setForm({ ...form, perfil: e.target.value })}>
                <option value="ceo">CEO</option>
                <option value="atendente">Atendente</option>
                <option value="estoquista">Estoquista</option>
                <option value="tecnico">Técnico</option>
              </Select>
            </Field>
            <Field label={editingId ? "Nova senha (opcional)" : "Senha"} error={errors.senha}>
              <TextInput
                type="password"
                value={form.senha}
                onChange={(e) => setForm({ ...form, senha: e.target.value })}
                placeholder="Mínimo 6 caracteres"
              />
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
        <EmptyState text="Carregando usuários..." />
      ) : items.length === 0 ? (
        <EmptyState text="Nenhum usuário cadastrado ainda." />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Telefone</th>
              <th>Perfil</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id}>
                <td>{u.nome}</td>
                <td>{u.email}</td>
                <td>{u.telefone}</td>
                <td>
                  <Badge tone={u.perfil === "tecnico" ? "blue" : u.perfil === "ceo" ? "amber" : "grey"}>
                    {PERFIL_LABEL[u.perfil]}
                  </Badge>
                </td>
                <td className="row-actions">
                  <button className="btn-link" onClick={() => startEdit(u)}>
                    Editar
                  </button>
                  <button className="btn-link btn-link-danger" onClick={() => handleRemove(u)}>
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
