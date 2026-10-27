// Limite de uso em memória (janela deslizante simples). Protege a rota pública
// do chat contra abuso e contra custo inesperado da API de IA. Em mais de uma
// instância do servidor, cada uma conta separado (suficiente para este projeto).
export function criarLimite({ janelaMs, maximo }) {
  const acessos = new Map();

  return function verificar(chave, agora = Date.now()) {
    const recentes = (acessos.get(chave) || []).filter((t) => agora - t < janelaMs);

    if (recentes.length >= maximo) {
      acessos.set(chave, recentes);
      return { ok: false, tentarEmSeg: Math.ceil((janelaMs - (agora - recentes[0])) / 1000) };
    }

    recentes.push(agora);
    acessos.set(chave, recentes);

    // Limpeza ocasional para a memória não crescer com IPs antigos.
    if (acessos.size > 5000) {
      for (const [k, v] of acessos) {
        if (!v.some((t) => agora - t < janelaMs)) acessos.delete(k);
      }
    }
    return { ok: true };
  };
}
