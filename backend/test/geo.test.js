import assert from "node:assert/strict";
import test from "node:test";

import { distanciaMetros } from "../src/geo/distancia.js";
import { chaveEndereco, geocodificarEndereco } from "../src/geo/geocodificacao.js";
import { raioPermitidoMetros } from "../src/checkin/checkinService.js";

test("distância (Haversine): pontos iguais = 0; ~111 m por 0,001° de latitude", () => {
  const a = { latitude: -23.766, longitude: -53.325 };
  assert.equal(Math.round(distanciaMetros(a, a)), 0);
  const d = distanciaMetros(a, { latitude: -23.765, longitude: -53.325 });
  assert.ok(d > 110 && d < 112, `distância ${d}`);
});

test("distância: Umuarama a Maringá fica perto de 100 km", () => {
  const d = distanciaMetros(
    { latitude: -23.766, longitude: -53.325 },
    { latitude: -23.4205, longitude: -51.9333 },
  );
  assert.ok(d > 140000 && d < 160000, `distância ${d}`);
});

test("raio do check-in: padrão 150 m e limites de 20 a 5000 m", () => {
  assert.equal(raioPermitidoMetros({}), 150);
  assert.equal(raioPermitidoMetros({ CHECKIN_RAIO_METROS: "300" }), 300);
  assert.equal(raioPermitidoMetros({ CHECKIN_RAIO_METROS: "1" }), 20);
  assert.equal(raioPermitidoMetros({ CHECKIN_RAIO_METROS: "999999" }), 5000);
  assert.equal(raioPermitidoMetros({ CHECKIN_RAIO_METROS: "abc" }), 150);
});

test("chave do endereço ignora partes vazias", () => {
  assert.equal(
    chaveEndereco({ logradouro: "Rua A", numero: "10", bairro: null, cidade: "Umuarama", estado: "PR", cep: "87500-000" }),
    "Rua A|10|Umuarama|PR|87500-000",
  );
});

const cliente = { logradouro: "Avenida Maringá", numero: "1200", bairro: "Zona I", cidade: "Umuarama", estado: "PR" };
const env = { GEOCODING_INTERVALO_MS: "0", GEOCODING_EMAIL: "teste@exemplo.com" };

test("geocodificação: usa o Nominatim, identifica o app e devolve lat/lon", async () => {
  let chamada;
  const fetchImpl = async (url, opcoes) => {
    chamada = { url, opcoes };
    return { ok: true, json: async () => [{ lat: "-23.7655123", lon: "-53.3187456" }] };
  };
  const ponto = await geocodificarEndereco(cliente, { env, fetchImpl });
  assert.deepEqual(ponto, { latitude: -23.765512, longitude: -53.318746 });
  assert.match(chamada.url, /^https:\/\/nominatim\.openstreetmap\.org\/search\?/);
  assert.match(chamada.url, /street=1200\+Avenida\+Maring%C3%A1/);
  assert.match(chamada.url, /email=teste%40exemplo\.com/);
  assert.match(chamada.opcoes.headers["User-Agent"], /UmuFrio-TCC/);
});

test("geocodificação: tenta 3 formas e desiste sem lançar erro", async () => {
  let chamadas = 0;
  const fetchImpl = async () => {
    chamadas += 1;
    return { ok: true, json: async () => [] };
  };
  assert.equal(await geocodificarEndereco(cliente, { env, fetchImpl }), null);
  assert.equal(chamadas, 3);
});

test("geocodificação: rede fora do ar ou resultado fora do Brasil dão null", async () => {
  const falha = async () => {
    throw new Error("sem rede");
  };
  assert.equal(await geocodificarEndereco(cliente, { env, fetchImpl: falha }), null);

  const exterior = async () => ({ ok: true, json: async () => [{ lat: "48.85", lon: "2.35" }] });
  assert.equal(await geocodificarEndereco(cliente, { env, fetchImpl: exterior }), null);

  assert.equal(await geocodificarEndereco({ cidade: "Umuarama" }, { env, fetchImpl: falha }), null);
});
