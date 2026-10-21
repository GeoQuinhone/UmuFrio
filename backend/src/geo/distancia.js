// Distância entre dois pontos da Terra (fórmula de Haversine), em metros.
const RAIO_TERRA_M = 6371008.8;

const rad = (graus) => (graus * Math.PI) / 180;

export function distanciaMetros(a, b) {
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * RAIO_TERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
