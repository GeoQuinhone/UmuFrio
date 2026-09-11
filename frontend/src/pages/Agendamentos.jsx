import React, { useState } from "react";
import Layout from "../components/Layout.jsx";
import { Field, TextInput, Select, Badge, EmptyState, ErrorBanner } from "../components/FormControls.jsx";

const emptyForm = { clienteId: "", tecnicoId: "", data: "", hora: "" };

export default function Agendamentos({ crud, clientes, usuarios, onBack }) {
  const { items, loading, error, add, action } = crud;
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState("");
  const [saving, setSaving] = useState(false);

  const clientesAtivos = clientes.items.filter((c) => c.status === "ativo");
  const tecnicos = usuarios.items.filter((u) => u.perfil === "tecnico");

  function clienteNome(id) {
    return clientes.items.find((c) => c.id === id)?.nome ?? "—";
  }
  function tecnicoNome(id) {
    return usuarios.items.find((u) => u.id === id)?.nome ?? "—";
  }

  function startNew() {
    if (clientesAtivos.length === 0) {
      setBanner("Cadastre ao menos um cliente ativo antes de agendar um serviço.");
      return;
    }
    if (tecnicos.length === 0) {
      setBanner('Cadastre ao menos um usuário com perfil "técnico" antes de agendar.');
      return;
    }
    setForm(emptyForm);
    setErrors({});
    setShowForm(true);
  }

  function validate() {
    const e = {};
    if (!form.clienteId) e.clienteId = "Selecione um cliente.";
    if (!form.tecnicoId) e.tecnicoId = "Selecione um técnico.";
    if (!form.data) e.data = "Informe a data.";
    if (!form.hora) e.hora = "Informe o horário.";

    if (!e.tecnicoId && !e.data && !e.hora) {
      const conflito = items.some(
        (a) => a.tecnicoId === Number(form.tecnicoId) && a.data === form.data && a.hora?.slice(0, 5) === form.hora && a.status === "agendado"
      );
      if (conflito) e.hora = "Este técnico já possui um serviço nesse horário.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      await add({
        clienteId: Number(form.clienteId),
        tecnicoId: Number(form.tecnicoId),
        data: form.data,
        hora: form.hora,
      });
      setShowForm(false);
      setForm(emptyForm);
      setBanner("");
    } catch (e) {
      setBanner(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelar(agendamento) {
    if (agendamento.status !== "agendado") return;
    if (!window.confirm("Cancelar este agendamento?")) return;
    try {
      await action(agendamento.id, "/cancelar");
      setBanner("");
    } catch (e) {
      setBanner(e.message);
    }
  }

  return (
    <Layout title="Agendamentos" subtitle="Agendar e cancelar serviços." onBack={onBack}>
      <ErrorBanner message={error || banner} onClose={() => setBanner("")} />

      <div className="toolbar">
        <button className="btn-primary" onClick={startNew}>
          + Novo agendamento
        </button>
      </div>

      {showForm && (
        <form className="form-card" onSubmit={handleSubmit}>
          <h3>Novo agendamento</h3>
          <div className="form-grid">
            <Field label="Cliente" error={errors.clienteId}>
              <Select value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })}>
                <option value="">Selecione...</option>
                {clientesAtivos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Técnico" error={errors.tecnicoId}>
              <Select value={form.tecnicoId} onChange={(e) => setForm({ ...form, tecnicoId: e.target.value })}>
                <option value="">Selecione...</option>
                {tecnicos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Data" error={errors.data}>
              <TextInput type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
            </Field>
            <Field label="Horário" error={errors.hora}>
              <TextInput type="time" value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} />
            </Field>
          </div>
          <div className="form-actions">
            <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Agendando..." : "Agendar"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <EmptyState text="Carregando agendamentos..." />
      ) : items.length === 0 ? (
        <EmptyState text="Nenhum agendamento cadastrado ainda." />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Técnico</th>
              <th>Data</th>
              <th>Horário</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items
              .slice()
              .sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora))
              .map((a) => (
                <tr key={a.id}>
                  <td>{clienteNome(a.clienteId)}</td>
                  <td>{tecnicoNome(a.tecnicoId)}</td>
                  <td>{a.data}</td>
                  <td>{a.hora?.slice(0, 5)}</td>
                  <td>
                    <Badge tone={a.status === "agendado" ? "blue" : "grey"}>{a.status}</Badge>
                  </td>
                  <td className="row-actions">
                    {a.status === "agendado" && (
                      <button className="btn-link btn-link-danger" onClick={() => handleCancelar(a)}>
                        Cancelar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </Layout>
  );
}
