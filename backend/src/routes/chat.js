import { Router } from "express";

import { pool } from "../db/client.js";
import { carregarContexto, configChat, linkWhatsapp, mensagemWhatsapp } from "../chat/contexto.js";
import { chatComIA, responderComClaude } from "../chat/claude.js";
import { responderDemonstracao } from "../chat/demo.js";
import { criarLimite } from "../chat/limite.js";
import { validarMensagens } from "../chat/validacao.js";

// Fase 5 — chat de atendimento na tela inicial, ANTES do login (rota pública).
// Sem dados de clientes: só serviços, horário e contato da empresa. Não guarda
// as conversas. Limites de uso por IP e global para evitar abuso e custo.

const q = async (texto, parametros) =>
  (await pool.query(texto, parametros)).rows;

const router = Router();

const porIp = criarLimite({ janelaMs: 5 * 60 * 1000, maximo: 12 });
const global = criarLimite({
  janelaMs: 60 * 60 * 1000,
  maximo: Number(process.env.CHAT_LIMITE_HORA) || 300,
});

// GET /api/chat/config: modo (IA ou demonstração) e contato, para o widget.
router.get("/config", (_req, res) => {
  const config = configChat();
  res.json({
    empresa: config.empresa,
    modo: chatComIA() ? "ia" : "demonstracao",
    whatsappUrl: linkWhatsapp(config, mensagemWhatsapp(config)),
  });
});

// POST /api/chat  { mensagens: [{ papel: "usuario"|"assistente", texto }] }
router.post("/", async (req, res, next) => {
  try {
    const limiteIp = porIp(req.ip || "desconhecido");
    if (!limiteIp.ok) {
      res.set("Retry-After", String(limiteIp.tentarEmSeg));
      return res.status(429).json({
        error: `Muitas mensagens em pouco tempo. Tente de novo em ${limiteIp.tentarEmSeg} s.`,
      });
    }
    if (!global("todos").ok) {
      return res.status(429).json({
        error: "O atendimento automático está muito procurado agora. Fale com um atendente pelo WhatsApp.",
      });
    }

    const mensagens = validarMensagens(req.body);
    const contexto = await carregarContexto(q);

    let resultado;
    let modo = "demonstracao";
    if (chatComIA()) {
      try {
        resultado = await responderComClaude({ mensagens, contexto });
        modo = "ia";
      } catch (erro) {
        console.error("Chat: IA indisponível, usando respostas de demonstração:", erro.message);
      }
    }
    if (!resultado) {
      resultado = responderDemonstracao(mensagens[mensagens.length - 1].texto, contexto);
    }

    res.json({
      resposta: resultado.resposta,
      encaminhar: Boolean(resultado.encaminhar) && Boolean(contexto.whatsapp),
      whatsappUrl: linkWhatsapp(contexto, mensagemWhatsapp(contexto)),
      modo,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
