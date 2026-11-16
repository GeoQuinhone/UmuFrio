// Teste manual do aviso pelo WhatsApp (não faz parte do sistema).
// Lê as variáveis GUPSHUP_* do backend/.env e manda UMA mensagem real.
//
//   node testar-whatsapp.mjs 44998049224 iniciado
//   (evento: iniciado, concluido ou nao_realizado; padrão: iniciado)
import "./src/loadEnv.js";
import { avisarCliente, provedorDoEvento } from "./src/whatsapp.js";

const [telefone, evento = "iniciado"] = process.argv.slice(2);

if (!telefone) {
  console.log("Uso: node testar-whatsapp.mjs <telefone com DDD> [iniciado|concluido|nao_realizado]");
  process.exit(1);
}

const provedor = provedorDoEvento(evento);
console.log(`Evento: ${evento} | caminho de envio: ${provedor || "nenhum (falta configurar)"}`);

const resultado = await avisarCliente(evento, {
  clienteNome: "Teste UmuFrio",
  clienteTelefone: telefone,
  servicoNome: "Limpeza de split",
  tecnicoNome: "Carlos Pereira",
  horario: new Date(),
});

console.log(`Resultado: ${resultado?.status}`);
if (resultado?.status === "enviado") {
  console.log("Mensagem enviada. Confira o WhatsApp do número informado.");
} else if (resultado?.status === "erro") {
  console.log("O Gupshup recusou. A mensagem de erro aparece logo acima.");
}

// Fecha a conexão com o banco (o token do Gupshup fica guardado nele).
try {
  const { pool } = await import("./src/db/client.js");
  await pool.end();
} catch {
  // sem banco configurado: nada a fechar
}
