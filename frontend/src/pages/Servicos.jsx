import React, { useState } from "react";
import Layout from "../components/Layout.jsx";
import { Field, Badge, EmptyState, ErrorBanner } from "../components/FormControls.jsx";

import { apiRequest } from "../api.js";

export default function Servicos({ crud, estoque, onBack }) {
  const { items, loading, error, add, remove, reload } = crud;
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ nome: "", descricao: "", valor: "", pecas: [] });
  const [formError, setFormError] = useState("");
  const [banner, setBanner] = useState("");
  const [saving, setSaving] = useState(false);

  function startNew() {
    setForm({ nome: "", descricao: "", valor: "", pecas: [] });
    setEditing("new");
    setFormError("");
  }

  function startEdit(item) {
    setForm({
      nome: item.nome,
      descricao: item.descricao || "",
      valor: Number(item.valor).toFixed(2),
      pecas: (item.pecas || []).map(p => ({ produtoId: String(p.produtoId), quantidadeNecessaria: String(p.quantidadeNecessaria) }))
    });
    setEditing(item.id);
    setFormError("");
  }

  function cancelEdit() {
    setEditing(null);
    setFormError("");
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (!form.nome || !form.valor) {
      setFormError("Nome e valor são obrigatórios.");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, pecas: form.pecas.filter(p => p.produtoId && Number(p.quantidadeNecessaria) > 0) };
      if (editing === "new") {
        await add(payload);
      } else {
        await apiRequest(`/servicos/${editing}`, {
          method: "PUT",
          body: JSON.stringify({ nome: payload.nome, descricao: payload.descricao, valor: payload.valor }),
        });
        await apiRequest(`/servicos/${editing}/pecas`, {
          method: "PUT",
          body: JSON.stringify({ pecas: payload.pecas }),
        });
        await reload();
      }
      setEditing(null);
      setBanner("");
    } catch (e) {
      setBanner(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Tem certeza que deseja excluir este serviço?")) return;
    try {
      await remove(id);
      setBanner("");
    } catch (e) {
      setBanner(e.message);
    }
  }

  function addPeca() {
    setForm({ ...form, pecas: [...form.pecas, { produtoId: "", quantidadeNecessaria: "1" }] });
  }

  function updatePeca(index, field, value) {
    const novas = [...form.pecas];
    novas[index][field] = value;
    setForm({ ...form, pecas: novas });
  }

  function removePeca(index) {
    const novas = [...form.pecas];
    novas.splice(index, 1);
    setForm({ ...form, pecas: novas });
  }

  return (
    <Layout title="Serviços e Peças" subtitle="Gerenciar catálogo de serviços e peças." onBack={onBack}>
      <ErrorBanner message={error || banner} onClose={() => setBanner("")} />

      <div className="toolbar">
        <button className="btn-primary" onClick={startNew}>+ Novo Serviço</button>
      </div>

      {editing && (
        <form className="form-card" onSubmit={handleSubmit}>
          <h3>{editing === "new" ? "Novo Serviço" : "Editar Serviço"}</h3>
          <div className="form-grid">
            <Field label="Nome do Serviço" error={formError}>
              <input className="input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} autoFocus />
            </Field>
            <Field label="Valor (R$)">
              <input className="input" type="number" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
            </Field>
            <Field label="Descrição (Opcional)">
              <input className="input" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </Field>
          </div>

          <div style={{ marginTop: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h4 style={{ margin: 0, color: "var(--navy)" }}>Peças Necessárias</h4>
              <button type="button" className="btn-ghost" style={{ padding: "4px 8px", fontSize: "0.85rem" }} onClick={addPeca}>
                + Adicionar Peça
              </button>
            </div>
            
            {form.pecas.length === 0 ? (
              <p style={{ color: "var(--grey)", fontSize: "0.9rem" }}>Nenhuma peça vinculada.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {form.pecas.map((peca, idx) => (
                  <div key={idx} style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                    <select
                      className="input"
                      style={{ flex: 1 }}
                      value={peca.produtoId}
                      onChange={(e) => updatePeca(idx, "produtoId", e.target.value)}
                    >
                      <option value="">Selecione o produto...</option>
                      {estoque.items.map(p => (
                        <option key={p.id} value={p.id}>{p.nome}</option>
                      ))}
                    </select>
                    <input
                      className="input input-qtd"
                      type="number"
                      min="1"
                      value={peca.quantidadeNecessaria}
                      onChange={(e) => updatePeca(idx, "quantidadeNecessaria", e.target.value)}
                    />
                    <button type="button" className="btn-link btn-link-danger" onClick={() => removePeca(idx)}>
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-actions">
            <button type="button" className="btn-ghost" onClick={cancelEdit}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <EmptyState text="Carregando serviços..." />
      ) : items.length === 0 ? (
        <EmptyState text="Nenhum serviço cadastrado ainda." />
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Serviço</th>
                <th>Valor</th>
                <th>Peças</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{s.nome}</div>
                    {s.descricao && <div style={{ fontSize: "0.85rem", color: "var(--grey)" }}>{s.descricao}</div>}
                  </td>
                  <td>R$ {Number(s.valor).toFixed(2)}</td>
                  <td>
                    {s.pecas?.length > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                        {s.pecas.map(p => (
                          <Badge key={p.id} tone="neutral">{p.quantidadeNecessaria}x {p.produtoNome}</Badge>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: "var(--grey)" }}>—</span>
                    )}
                  </td>
                  <td className="row-actions">
                    <button className="btn-link" onClick={() => startEdit(s)}>Editar</button>
                    <button className="btn-link btn-link-danger" onClick={() => handleDelete(s.id)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}