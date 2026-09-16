export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

export async function apiRequest(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (res.status === 204) return null;

  let data = null;
  try {
    data = await res.json();
  } catch {
    // resposta sem corpo JSON
  }

  if (!res.ok) {
    throw new Error(data?.error || `Erro ${res.status} ao acessar ${path}`);
  }
  return data;
}
