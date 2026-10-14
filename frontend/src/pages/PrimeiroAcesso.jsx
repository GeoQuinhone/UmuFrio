import React, { useState } from "react";

import { useAuth } from "../AuthContext.jsx";
import { apiRequest } from "../api.js";
import "./auth.css";

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
      setUser({ ...user, primeiroAcesso: 0 });
    } catch (requestError) {
      setError(requestError.message || "Erro ao trocar a senha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-setup">
      <main className="auth-setup-card auth-password-card">
        <img
          className="auth-logo"
          src="/brand/umufrio-logo.png"
          alt="UmuFrio"
        />
        <h1>Bem-vindo, {user.nome}!</h1>
        <p>Este é o seu primeiro acesso. Defina uma nova senha para continuar.</p>
        {error && <div className="auth-feedback auth-error" role="alert">{error}</div>}
        <form className="auth-setup-form" onSubmit={handleSubmit}>
          <div className="auth-setup-grid">
            <label className="auth-field auth-field-full">
              <span>Senha atual</span>
              <input
                type="password"
                autoComplete="current-password"
                value={senhaAtual}
                onChange={(event) => setSenhaAtual(event.target.value)}
                required
                autoFocus
              />
            </label>
            <label className="auth-field auth-field-full">
              <span>Nova senha</span>
              <input
                type="password"
                autoComplete="new-password"
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
                minLength={6}
                required
              />
            </label>
            <label className="auth-field auth-field-full">
              <span>Confirmar nova senha</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmar}
                onChange={(event) => setConfirmar(event.target.value)}
                minLength={6}
                required
              />
            </label>
          </div>
          <button className="auth-primary" type="submit" disabled={loading}>
            {loading ? "Salvando..." : "Salvar senha e continuar"}
          </button>
        </form>
      </main>
    </div>
  );
}