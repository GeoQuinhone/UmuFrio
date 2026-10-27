import { erroHttp } from "../httpError.js";

// A rota do chat é pública: limites rígidos no que aceitamos.
const MAX_MENSAGENS = 12;
const MAX_TEXTO = 600;
const MAX_TOTAL = 4000;

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
    if (texto.length > MAX_TEXTO) {
      throw erroHttp(`Cada mensagem pode ter no máximo ${MAX_TEXTO} caracteres.`, 400);
    }
    total += texto.length;
    return { papel, texto };
  });

  if (total > MAX_TOTAL) throw erroHttp("A conversa ficou longa demais. Comece uma nova.", 400);
  if (mensagens[mensagens.length - 1].papel !== "usuario") {
    throw erroHttp("A última mensagem precisa ser do usuário.", 400);
  }
  return mensagens;
}
