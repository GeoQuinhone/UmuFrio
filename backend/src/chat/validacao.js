import { erroHttp } from "../httpError.js";

// A rota do chat é pública: limites rígidos no que aceitamos.
const MAX_MENSAGENS = 12;
const MAX_TEXTO = 600; // limite da mensagem digitada pelo visitante
const MAX_TEXTO_ASSISTENTE = 1500; // respostas da IA que voltam no histórico (podem passar de 600)
const MAX_TOTAL = 8000;

export function validarMensagens(corpo) {
  const lista = corpo?.mensagens;
  if (!Array.isArray(lista) || lista.length === 0 || lista.length > MAX_MENSAGENS) {
    throw erroHttp("Envie de 1 a 12 mensagens.", 400);
  }

  let total = 0;
  const mensagens = lista.map((item) => {
    const papel = item?.papel;
    const texto = typeof item?.texto === "string" ? item.texto.trim() : "";
    if (!["usuario", "assistente"].includes(papel) || !texto) {
      throw erroHttp("Mensagem inválida.", 400);
    }
    // O limite de 600 vale só para o que o visitante digita. A resposta da IA volta no histórico e pode ser
    // maior: antes, uma resposta longa fazia TODA mensagem seguinte ser recusada. Aqui ela só é cortada.
    if (papel === "usuario" && texto.length > MAX_TEXTO) {
      throw erroHttp(`Cada mensagem pode ter no máximo ${MAX_TEXTO} caracteres.`, 400);
    }
    const final = papel === "assistente" ? texto.slice(0, MAX_TEXTO_ASSISTENTE) : texto;
    total += final.length;
    return { papel, texto: final };
  });

  if (total > MAX_TOTAL) throw erroHttp("A conversa ficou longa demais. Comece uma nova.", 400);
  if (mensagens[mensagens.length - 1].papel !== "usuario") {
    throw erroHttp("A última mensagem precisa ser do usuário.", 400);
  }
  return mensagens;
}
