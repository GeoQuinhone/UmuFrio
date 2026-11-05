// Fase 8: aviso ao técnico quando um atendimento está perto do horário.
// Considera o atendimento agendado e ainda não iniciado, de hoje, que começa
// nos próximos `janelaMin` minutos (ou que atrasou até `atrasoMin` minutos).

export const JANELA_AVISO_MIN = 60;
export const ATRASO_AVISO_MIN = 30;

function dataLocalISO(agora) {
  const dois = (n) => String(n).padStart(2, "0");
  return `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`;
}

export function minutosAte(item, agora = new Date()) {
  const [h, m] = String(item.hora || "00:00").split(":").map(Number);
  const alvo = new Date(agora);
  alvo.setHours(h || 0, m || 0, 0, 0);
  return Math.round((alvo.getTime() - agora.getTime()) / 60000);
}

export function atendimentosProximos(itens, tecnicoId, agora = new Date(), janelaMin = JANELA_AVISO_MIN, atrasoMin = ATRASO_AVISO_MIN) {
  const hoje = dataLocalISO(agora);
  return (itens || [])
    .filter(
      (a) =>
        a.tecnicoId === tecnicoId &&
        a.status === "agendado" &&
        a.data === hoje &&
        (!a.ordemStatus || a.ordemStatus === "aberta"),
    )
    .map((a) => ({ ...a, minutos: minutosAte(a, agora) }))
    .filter((a) => a.minutos <= janelaMin && a.minutos >= -atrasoMin)
    .sort((a, b) => a.minutos - b.minutos);
}

export function textoFaltam(minutos) {
  if (minutos > 1) return `começa em ${minutos} min`;
  if (minutos >= 0) return "começa agora";
  return `atrasado há ${Math.abs(minutos)} min`;
}
