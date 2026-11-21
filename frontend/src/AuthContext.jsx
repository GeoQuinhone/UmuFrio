import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import { useNavigate } from "react-router-dom";

import { apiRequest, setAuthCallback } from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Fase 11: ao sair, limpa também o endereço (ex.: /agendamentos), para não reaparecer no próximo login.
  // Sessão expirada leva ao login; sair pelo botão leva à página inicial.
  function logout(destino = "/") {
    localStorage.removeItem("token");
    setUser(null);
    navigate(destino, { replace: true });
  }

  async function loadUser() {
    try {
      const userData = await apiRequest("/auth/me");
      setUser(userData);
    } catch {
      localStorage.removeItem("token");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setAuthCallback(() => logout("/login"));

    const token = localStorage.getItem("token");

    if (token) {
      loadUser();
    } else {
      setLoading(false);
    }
  }, []);

  async function login(email, senha) {
    const data = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email,
        senha,
      }),
    });

    localStorage.setItem("token", data.token);
    setUser(data.usuario);
    // Fase 11: todo login começa no painel inicial.
    navigate("/", { replace: true });
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout: () => logout(),
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}