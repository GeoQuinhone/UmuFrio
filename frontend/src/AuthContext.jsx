import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import { apiRequest, setAuthCallback } from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  function logout() {
    localStorage.removeItem("token");
    setUser(null);
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
    setAuthCallback(logout);

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
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
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