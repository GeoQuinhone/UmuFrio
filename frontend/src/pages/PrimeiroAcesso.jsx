import React, { useState } from "react";

import { useAuth } from "../AuthContext.jsx";
import { apiRequest } from "../api.js";

export default function PrimeiroAcesso() {
  const { user, setUser } = useAuth();

  const [senhaAtual, setSenhaAtual] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!senhaAtual) {
      setError("Informe a senha atual.");
      return;
    }

    if (senha.length < 6) {
      setError("A nova senha deve ter no mínimo 6 caracteres.");
      return;
    }

    if (senha !== confirmar) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await apiRequest("/auth/trocar-senha", {
        method: "POST",
        body: JSON.stringify({
          senhaAtual,
          novaSenha: senha,
        }),
      });

      setUser({
        ...user,
        primeiroAcesso: 0,
      });
    } catch (requestError) {
      setError(
        requestError.message || "Erro ao trocar a senha.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <div
          style={{
            textAlign: "center",
            marginBottom: "2rem",
          }}
        >
          <span className="brand-dot brand-dot-lg" />

          <h2>Bem-vindo, {user.nome}!</h2>

          <p style={{ color: "var(--grey)" }}>
            Este é o seu primeiro acesso. Defina uma nova senha para
            continuar.
          </p>
        </div>

        {error && (
          <div className="error-msg" role="alert">
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="form-grid"
          style={{ gridTemplateColumns: "1fr" }}
        >
          <div className="form-group">
            <label htmlFor="senha-atual">Senha atual</label>

            <input
              id="senha-atual"
              type="password"
              autoComplete="current-password"
              value={senhaAtual}
              onChange={(event) =>
                setSenhaAtual(event.target.value)
              }
              className="input"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="nova-senha">Nova senha</label>

            <input
              id="nova-senha"
              type="password"
              autoComplete="new-password"
              value={senha}
              onChange={(event) =>
                setSenha(event.target.value)
              }
              className="input"
              required
              minLength={6}
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmar-senha">
              Confirmar nova senha
            </label>

            <input
              id="confirmar-senha"
              type="password"
              autoComplete="new-password"
              value={confirmar}
              onChange={(event) =>
                setConfirmar(event.target.value)
              }
              className="input"
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ marginTop: "1rem" }}
          >
            {loading
              ? "Salvando..."
              : "Salvar senha e continuar"}
          </button>
        </form>
      </div>
    </div>
  );
}