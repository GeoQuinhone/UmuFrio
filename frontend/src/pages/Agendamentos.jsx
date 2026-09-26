import React, { useState } from "react";
import Layout from "../components/Layout.jsx";
import {
  Field,
  TextInput,
  Select,
  Badge,
  EmptyState,
  ErrorBanner,
} from "../components/FormControls.jsx";
import { useAuth } from "../AuthContext.jsx";

const FORM_VAZIO = {
  clienteId: "",
  tecnicoId: "",
  data: "",
  hora: "",
};

export default function Agendamentos({
  crud,
  clientes,
  usuarios,
  onBack,
}) {
  const { user } = useAuth();
  const isTecnico = user?.perfil === "tecnico";

  const {
    items,
    loading,
    error,
    add,
    action,
  } = crud;

  const [form, setForm] = useState(FORM_VAZIO);
  const [showForm, setShowForm] = useState(false);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState("");
  const [saving, setSaving] = useState(false);

  const clientesAtivos = (
    clientes.items || []
  ).filter((cliente) =>
    cliente.status === "ativo",
  );

  const tecnicos = (
    usuarios.items || []
  ).filter(
    (usuario) =>
      usuario.perfil === "tecnico" &&
      usuario.ativo !== 0,
  );

  function clienteNome(id) {
    return (
      clientes.items?.find(
        (cliente) => cliente.id === id,
      )?.nome || `Cliente #${id}`
    );
  }

  function tecnicoNome(id) {
    return (
      usuarios.items?.find(
        (usuario) => usuario.id === id,
      )?.nome || `Técnico #${id}`
    );
  }

  function iniciarNovo() {
    if (clientesAtivos.length === 0) {
      setBanner(
        "Cadastre pelo menos um cliente ativo antes de agendar.",
      );
      return;
    }

    if (tecnicos.length === 0) {
      setBanner(
        'Cadastre pelo menos um usuário com perfil "técnico" antes de agendar.',
      );
      return;
    }

    setForm(FORM_VAZIO);
    setErrors({});
    setShowForm(true);
  }

  function validar() {
    const novosErros = {};

    if (!form.clienteId) {
      novosErros.clienteId =
        "Selecione um cliente.";
    }

    if (!form.tecnicoId) {
      novosErros.tecnicoId =
        "Selecione um técnico.";
    }

    if (!form.data) {
      novosErros.data = "Informe a data.";
    }

    if (!form.hora) {
      novosErros.hora = "Informe o horário.";
    }

    if (
      !novosErros.tecnicoId &&
      !novosErros.data &&
      !novosErros.hora
    ) {
      const conflito = items.some(
        (agendamento) =>
          agendamento.tecnicoId ===
            Number(form.tecnicoId) &&
          agendamento.data === form.data &&
          agendamento.hora?.slice(0, 5) ===
            form.hora &&
          agendamento.status === "agendado",
      );

      if (conflito) {
        novosErros.hora =
          "Este técnico já possui um serviço nesse horário.";
      }
    }

    setErrors(novosErros);

    return Object.keys(novosErros).length === 0;
  }

  async function salvar(event) {
    event.preventDefault();

    if (!validar()) {
      return;
    }

    setSaving(true);

    try {
      await add({
        clienteId: Number(form.clienteId),
        tecnicoId: Number(form.tecnicoId),
        data: form.data,
        hora: form.hora,
      });

      setShowForm(false);
      setForm(FORM_VAZIO);
      setBanner("");
    } catch (saveError) {
      setBanner(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function cancelar(agendamento) {
    if (agendamento.status !== "agendado") {
      return;
    }

    if (
      !window.confirm(
        "Cancelar este agendamento?",
      )
    ) {
      return;
    }

    try {
      await action(
        agendamento.id,
        "/cancelar",
      );
      setBanner("");
    } catch (actionError) {
      setBanner(actionError.message);
    }
  }

  return (
    <Layout
      title="Agendamentos"
      subtitle="Agendar e cancelar serviços."
      onBack={onBack}
    >
      <ErrorBanner
        message={error || banner}
        onClose={() => setBanner("")}
      />

      {!isTecnico && (
        <div className="toolbar">
          <button
            className="btn-primary"
            onClick={iniciarNovo}
          >
            + Novo agendamento
          </button>
        </div>
      )}

      {showForm && !isTecnico && (
        <form
          className="form-card"
          onSubmit={salvar}
        >
          <h3>Novo agendamento</h3>

          <div className="form-grid">
            <Field
              label="Cliente"
              error={errors.clienteId}
            >
              <Select
                value={form.clienteId}
                onChange={(event) =>
                  setForm({
                    ...form,
                    clienteId:
                      event.target.value,
                  })
                }
              >
                <option value="">
                  Selecione...
                </option>

                {clientesAtivos.map((cliente) => (
                  <option
                    key={cliente.id}
                    value={cliente.id}
                  >
                    {cliente.nome}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Técnico"
              error={errors.tecnicoId}
            >
              <Select
                value={form.tecnicoId}
                onChange={(event) =>
                  setForm({
                    ...form,
                    tecnicoId:
                      event.target.value,
                  })
                }
              >
                <option value="">
                  Selecione...
                </option>

                {tecnicos.map((tecnico) => (
                  <option
                    key={tecnico.id}
                    value={tecnico.id}
                  >
                    {tecnico.nome}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Data"
              error={errors.data}
            >
              <TextInput
                type="date"
                value={form.data}
                onChange={(event) =>
                  setForm({
                    ...form,
                    data: event.target.value,
                  })
                }
              />
            </Field>

            <Field
              label="Horário"
              error={errors.hora}
            >
              <TextInput
                type="time"
                value={form.hora}
                onChange={(event) =>
                  setForm({
                    ...form,
                    hora: event.target.value,
                  })
                }
              />
            </Field>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setShowForm(false)}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="btn-primary"
              disabled={saving}
            >
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
        <div className="table-responsive">
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
                .sort((a, b) =>
                  `${a.data || ""} ${a.hora || ""}`.localeCompare(
                    `${b.data || ""} ${b.hora || ""}`,
                  ),
                )
                .map((agendamento) => (
                  <tr key={agendamento.id}>
                    <td>
                      {clienteNome(
                        agendamento.clienteId,
                      )}
                    </td>

                    <td>
                      {tecnicoNome(
                        agendamento.tecnicoId,
                      )}
                    </td>

                    <td>{agendamento.data}</td>

                    <td>
                      {agendamento.hora?.slice(0, 5)}
                    </td>

                    <td>
                      <Badge
                        tone={
                          agendamento.status ===
                          "agendado"
                            ? "blue"
                            : "grey"
                        }
                      >
                        {agendamento.status}
                      </Badge>
                    </td>

                    <td className="row-actions">
                      {agendamento.status ===
                        "agendado" && (
                        <button
                          className="btn-link btn-link-danger"
                          onClick={() =>
                            cancelar(agendamento)
                          }
                        >
                          Cancelar
                        </button>
                      )}
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