import { erroHttp } from "../httpError.js";
import { distanciaMetros } from "../geo/distancia.js";
import { chaveEndereco, geocodificarEndereco } from "../geo/geocodificacao.js";

// Check-in e check-out geolocalizados do técnico (Fase 5).
//
// Regras:
//  - só o técnico responsável pelo atendimento registra (a posição vem do
//    navegador dele); CEO e atendente apenas consultam;
//  - um check-in e um check-out por ordem de serviço;
//  - a distância até o endereço do cliente é calculada AQUI (o navegador não
//    decide se está "dentro do raio");
//  - fora do raio: o registro só é aceito com justificativa e fica marcado;
//  - sem coordenadas do cliente (endereço não localizado): registra a posição,
//    sem distância, e o relatório conta como "sem referência".
//
// As funções recebem `q(texto, parametros)` (linhas do resultado), como o PIX.

const RAIO_PADRAO_M = 150;

export function raioPermitidoMetros(env = process.env) {
  const valor = Number(env.CHECKIN_RAIO_METROS);
  if (!Number.isFinite(valor) || valor <= 0) return RAIO_PADRAO_M;
  return Math.min(Math.max(Math.round(valor), 20), 5000);
}

// Fase 11: o check-in só vale no dia do atendimento, a partir de 2 horas antes
// do horário marcado até o fim daquele dia (horário de Brasília).
const ANTECEDENCIA_CHECKIN_MIN = 120;

export function janelaCheckin(data, hora) {
  if (!data || !hora) return null;
  const horario = new Date(`${data}T${String(hora).slice(0, 5)}:00-03:00`);
  if (Number.isNaN(horario.getTime())) return null;
  return {
    abre: new Date(horario.getTime() - ANTECEDENCIA_CHECKIN_MIN * 60 * 1000),
    fecha: new Date(`${data}T23:59:59.999-03:00`),
  };
}

function dataHoraBrasilia(data) {
  return data.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).replace(",", " às");
}

// Justificativa de fora do raio: pelo menos duas palavras (evita "ffffff").
export function justificativaValida(texto) {
  const palavras = String(texto ?? "").trim().split(/\s+/).filter((p) => /\p{L}{2,}/u.test(p));
  return palavras.length >= 2;
}

const COLUNAS = `
  id,
  tipo,
  latitude::float8 AS latitude,
  longitude::float8 AS longitude,
  precisao_m::float8 AS "precisaoM",
  distancia_m AS "distanciaM",
  raio_m AS "raioM",
  dentro_raio AS "dentroRaio",
  justificativa,
  criado_em AS "criadoEm"`;

async function carregarOrdem(q, ordemId) {
  const [ordem] = await q(
    `SELECT o.id,
            o.status,
            a.tecnico_id AS "tecnicoId",
            a.status AS "agendamentoStatus",
            to_char(a.data, 'YYYY-MM-DD') AS "dataAgendada",
            to_char(a.hora, 'HH24:MI') AS "horaAgendada",
            c.id AS "clienteId",
            c.logradouro, c.numero, c.bairro, c.cidade, c.estado, c.cep,
            c.latitude::float8 AS latitude,
            c.longitude::float8 AS longitude,
            c.geo_endereco AS "geoEndereco"
       FROM ordens_servico o
       JOIN agendamentos a ON a.id = o.agendamento_id
       JOIN clientes c ON c.id = a.cliente_id
      WHERE o.id = $1`,
    [ordemId],
  );
  if (!ordem) throw erroHttp("Ordem de serviço não encontrada.", 404);
  return ordem;
}

function exigirAcessoLeitura(ordem, usuario) {
  if (usuario.perfil === "tecnico" && ordem.tecnicoId !== usuario.id) {
    throw erroHttp("Você não pode acessar esta ordem de serviço.", 403);
  }
}

async function registrosDaOrdem(q, ordemId) {
  return q(
    `SELECT ${COLUNAS} FROM registros_localizacao WHERE ordem_id = $1 ORDER BY id`,
    [ordemId],
  );
}

function agrupar(registros) {
  return {
    checkin: registros.find((r) => r.tipo === "checkin") || null,
    checkout: registros.find((r) => r.tipo === "checkout") || null,
  };
}

// Coordenadas do cliente: usa as guardadas se o endereço não mudou; senão
// geocodifica (Nominatim) e guarda. Se não achar, devolve null.
export async function obterReferenciaCliente(q, ordem, { geocodificar = geocodificarEndereco } = {}) {
  const chave = chaveEndereco(ordem);

  if (ordem.latitude !== null && ordem.longitude !== null && ordem.geoEndereco === chave) {
    return { latitude: ordem.latitude, longitude: ordem.longitude };
  }

  const ponto = await geocodificar(ordem);

  if (!ponto) {
    // Endereço mudou e não achamos o novo: não manter a coordenada antiga.
    if (ordem.latitude !== null && ordem.geoEndereco !== chave) {
      await q(
        `UPDATE clientes SET latitude = NULL, longitude = NULL, geo_endereco = NULL,
                geocodificado_em = NULL WHERE id = $1`,
        [ordem.clienteId],
      );
    }
    return null;
  }

  await q(
    `UPDATE clientes SET latitude = $2, longitude = $3, geo_endereco = $4,
            geocodificado_em = now() WHERE id = $1`,
    [ordem.clienteId, ponto.latitude, ponto.longitude, chave],
  );
  return ponto;
}

export async function consultarLocalizacao(
  q,
  { ordemId, usuario },
  { env = process.env, agora = new Date() } = {},
) {
  const ordem = await carregarOrdem(q, ordemId);
  exigirAcessoLeitura(ordem, usuario);
  const registros = agrupar(await registrosDaOrdem(q, ordemId));
  const janela = janelaCheckin(ordem.dataAgendada, ordem.horaAgendada);
  return {
    raioM: raioPermitidoMetros(env),
    // A tela usa estes campos para trocar o botão por um aviso fora do dia.
    checkinAbreEm: janela ? janela.abre.toISOString() : null,
    checkinFechaEm: janela ? janela.fecha.toISOString() : null,
    checkinNoPrazo: !janela || (agora >= janela.abre && agora <= janela.fecha),
    clienteTemReferencia: ordem.latitude !== null && ordem.geoEndereco === chaveEndereco(ordem),
    podeRegistrar: usuario.perfil === "tecnico" && ordem.tecnicoId === usuario.id,
    ...registros,
  };
}

function lerPosicao(posicao) {
  const latitude = Number(posicao?.latitude);
  const longitude = Number(posicao?.longitude);
  if (
    posicao?.latitude === null || posicao?.latitude === undefined || posicao?.latitude === "" ||
    posicao?.longitude === null || posicao?.longitude === undefined || posicao?.longitude === "" ||
    !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 || Math.abs(longitude) > 180
  ) {
    throw erroHttp("Posição inválida. Permita o acesso à localização e tente de novo.", 400);
  }
  let precisao = Number(posicao?.precisao);
  if (!Number.isFinite(precisao) || precisao < 0 || precisao > 1000000) precisao = null;
  return {
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6)),
    precisao: precisao === null ? null : Number(precisao.toFixed(1)),
  };
}

export async function registrarLocalizacao(
  q,
  { ordemId, tipo, usuario, posicao, justificativa },
  { env = process.env, geocodificar, agora = new Date() } = {},
) {
  if (!["checkin", "checkout"].includes(tipo)) {
    throw erroHttp("Tipo de registro inválido.", 400);
  }

  const ordem = await carregarOrdem(q, ordemId);

  if (usuario.perfil !== "tecnico" || ordem.tecnicoId !== usuario.id) {
    throw erroHttp("Somente o técnico responsável pelo atendimento pode registrar a localização.", 403);
  }
  if (ordem.agendamentoStatus !== "agendado") {
    throw erroHttp("Este atendimento foi cancelado.", 409);
  }

  const existentes = agrupar(await registrosDaOrdem(q, ordemId));

  if (tipo === "checkin") {
    if (existentes.checkin) throw erroHttp("O check-in deste atendimento já foi registrado.", 409);
    if (ordem.status === "concluida") {
      throw erroHttp("O atendimento já foi concluído. Não é possível fazer o check-in.", 409);
    }
    const janela = janelaCheckin(ordem.dataAgendada, ordem.horaAgendada);
    if (janela && agora < janela.abre) {
      throw erroHttp(
        `O check-in só pode ser feito no dia do atendimento, a partir de ${dataHoraBrasilia(janela.abre)}.`,
        409,
      );
    }
    if (janela && agora > janela.fecha) {
      throw erroHttp("O dia deste atendimento já passou. Não é possível fazer o check-in.", 409);
    }
  } else {
    if (!existentes.checkin) throw erroHttp("Faça o check-in antes do check-out.", 409);
    if (existentes.checkout) throw erroHttp("O check-out deste atendimento já foi registrado.", 409);
    if (ordem.status === "aberta") {
      throw erroHttp("Inicie o atendimento antes de fazer o check-out.", 409);
    }
  }

  const ponto = lerPosicao(posicao);
  const raio = raioPermitidoMetros(env);
  const referencia = await obterReferenciaCliente(q, ordem, { geocodificar });

  let distancia = null;
  let dentro = null;
  if (referencia) {
    distancia = Math.round(distanciaMetros(ponto, referencia));
    dentro = distancia <= raio;
  }

  const motivo = String(justificativa ?? "").trim();
  if (dentro === false && motivo.length < 5) {
    throw erroHttp(
      `Você está a ${distancia} m do endereço do cliente (limite: ${raio} m). Informe uma justificativa para registrar.`,
      422,
      { codigo: "FORA_DO_RAIO", distanciaM: distancia, raioM: raio },
    );
  }
  if (dentro === false && !justificativaValida(motivo)) {
    throw erroHttp("Escreva o motivo com pelo menos duas palavras (ex.: sem vaga em frente).", 400);
  }
  if (motivo.length > 255) {
    throw erroHttp("A justificativa pode ter no máximo 255 caracteres.", 400);
  }

  const [registro] = await q(
    `INSERT INTO registros_localizacao
       (ordem_id, tipo, usuario_id, latitude, longitude, precisao_m,
        distancia_m, raio_m, dentro_raio, justificativa)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (ordem_id, tipo) DO NOTHING
     RETURNING ${COLUNAS}`,
    [
      ordemId, tipo, usuario.id, ponto.latitude, ponto.longitude, ponto.precisao,
      distancia, raio, dentro,
      dentro === false ? motivo : motivo || null,
    ],
  );

  if (!registro) throw erroHttp("Este registro já foi feito.", 409);
  return registro;
}
