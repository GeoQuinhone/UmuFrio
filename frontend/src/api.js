export const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3001/api";

let authCallback = null;

export function setAuthCallback(callback) {
  authCallback = callback;
}

export async function apiRequest(path, options = {}) {
  const token = localStorage.getItem("token");

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  let data = null;

  if (response.status !== 204) {
    try {
      data = await response.json();
    } catch {
      // A resposta pode não conter JSON.
    }
  }

  if (response.status === 401 || response.status === 403) {
    if (
      response.status === 401 &&
      authCallback &&
      path !== "/auth/login" &&
      path !== "/auth/me"
    ) {
      authCallback();
    }

    throw new Error(data?.error || "Não autenticado.");
  }

  if (response.status === 204) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      data?.error || `Erro ${response.status} ao acessar ${path}`,
    );
  }

  return data;
}