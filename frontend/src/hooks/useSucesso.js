import { useEffect, useState } from "react";

// Mensagem de sucesso que some sozinha depois de alguns segundos.
export function useSucesso(duracaoMs = 6000) {
  const [sucesso, setSucesso] = useState("");

  useEffect(() => {
    if (!sucesso) return undefined;
    const timer = setTimeout(() => setSucesso(""), duracaoMs);
    return () => clearTimeout(timer);
  }, [sucesso, duracaoMs]);

  return [sucesso, setSucesso];
}
