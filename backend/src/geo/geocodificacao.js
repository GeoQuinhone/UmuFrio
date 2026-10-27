// Converte o endereço do cliente em latitude/longitude usando o Nominatim
// (OpenStreetMap), gratuito e sem chave. Regras de uso do serviço público:
// no máximo 1 requisição por segundo e identificação (User-Agent) do aplicativo.
// Aqui as consultas são feitas em fila, uma por vez, com 1,1 s de intervalo.
//
// Variáveis (opcionais):
//   NOMINATIM_URL        servidor (padrão: https://nominatim.openstreetmap.org)
//   GEOCODING_EMAIL      e-mail de contato enviado ao Nominatim (recomendado)
//   GEOCODING_USER_AGENT identificação completa (substitui o padrão)

const URL_PADRAO = "https://nominatim.openstreetmap.org";
const TIMEOUT_MS = 8000;
const INTERVALO_PADRAO_MS = 1100;

const intervalo = (env) => {
  const v = Number(env.GEOCODING_INTERVALO_MS);
  return Number.isFinite(v) && v >= 0 ? v : INTERVALO_PADRAO_MS;
};

// Chave que identifica o endereço usado na geocodificação: se o endereço do
// cliente mudar, a coordenada guardada deixa de valer.
export function chaveEndereco(cliente) {
  return [
    cliente.logradouro,
    cliente.numero,
    cliente.bairro,
    cliente.cidade,
    cliente.estado,
    cliente.cep,
  ]
    .map((parte) => String(parte ?? "").trim())
    .filter(Boolean)
    .join("|");
}

function coordenadaValida(lat, lon) {
  // Caixa aproximada do Brasil, para descartar resultados absurdos.
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -34 &&
    lat <= 6 &&
    lon >= -74 &&
    lon <= -28
  );
}

let ultimaConsulta = 0;
let fila = Promise.resolve();

function naFila(tarefa, espacoMs) {
  const proxima = fila.then(async () => {
    const espera = ultimaConsulta + espacoMs - Date.now();
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    try {
      return await tarefa();
    } finally {
      ultimaConsulta = Date.now();
    }
  });
  fila = proxima.catch(() => {});
  return proxima;
}

async function buscar(parametros, { env, fetchImpl }) {
  const base = String(env.NOMINATIM_URL || URL_PADRAO).replace(/\/+$/, "");
  const email = String(env.GEOCODING_EMAIL || "").trim();
  const query = new URLSearchParams({
    format: "jsonv2",
    limit: "1",
    countrycodes: "br",
    ...parametros,
  });
  if (email) query.set("email", email);

  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), TIMEOUT_MS);
  try {
    const resposta = await fetchImpl(`${base}/search?${query}`, {
      headers: {
        "User-Agent":
          env.GEOCODING_USER_AGENT ||
          `UmuFrio-TCC/1.0${email ? ` (${email})` : ""}`,
        "Accept-Language": "pt-BR",
      },
      signal: controle.signal,
    });
    if (!resposta.ok) return null;
    const [achado] = (await resposta.json()) || [];
    if (!achado) return null;
    const latitude = Number(achado.lat);
    const longitude = Number(achado.lon);
    return coordenadaValida(latitude, longitude)
      ? {
          latitude: Number(latitude.toFixed(6)),
          longitude: Number(longitude.toFixed(6)),
        }
      : null;
  } catch {
    return null; // sem rede/tempo esgotado: o check-in segue sem referência
  } finally {
    clearTimeout(timer);
  }
}

// Devolve { latitude, longitude } ou null (não achou / sem rede). Nunca lança.
export async function geocodificarEndereco(
  cliente,
  { env = process.env, fetchImpl = globalThis.fetch } = {},
) {
  if (!cliente?.logradouro || !cliente?.cidade) return null;
  const deps = { env, fetchImpl };
  const espaco = intervalo(env);
  const rua = [cliente.numero, cliente.logradouro].filter(Boolean).join(" ");

  return naFila(async () => {
    // 1) busca estruturada com número
    let ponto = await buscar(
      {
        street: rua,
        city: cliente.cidade,
        state: cliente.estado || "",
        country: "Brasil",
      },
      deps,
    );
    if (ponto) return ponto;

    // 2) texto livre incluindo o bairro
    await new Promise((r) => setTimeout(r, espaco));
    ponto = await buscar(
      {
        q: [rua, cliente.bairro, cliente.cidade, cliente.estado, "Brasil"]
          .filter(Boolean)
          .join(", "),
      },
      deps,
    );
    if (ponto) return ponto;

    // 3) a rua sem número (aproxima pela via)
    await new Promise((r) => setTimeout(r, espaco));
    return buscar(
      {
        street: cliente.logradouro,
        city: cliente.cidade,
        state: cliente.estado || "",
        country: "Brasil",
      },
      deps,
    );
  }, espaco);
}
