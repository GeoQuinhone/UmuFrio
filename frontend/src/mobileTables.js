// Ajuda de celular: transforma as tabelas em "cartões" (um cartão por linha).
// Para cada <td> copia o título da coluna para o atributo data-label, que o
// CSS (mobile.css) mostra à esquerda do valor. Não muda nenhuma tela: cobre as
// tabelas que já existem e as que forem criadas depois.
const IGNORAR = ".rel-table"; // tabelas dos relatórios continuam com rolagem

function rotular(tabela) {
  if (tabela.matches(IGNORAR)) return;
  tabela.classList.add("tabela-cartoes");
  // Coluna só com texto escondido (ex.: "Ações") não ganha título.
  const titulos = [...tabela.querySelectorAll("thead th")].map((th) => {
    const escondido = th.querySelector('[class*="visually-hidden"]');
    const texto = (th.textContent || "").trim();
    return escondido && escondido.textContent.trim() === texto ? "" : texto;
  });
  tabela.querySelectorAll("tbody tr").forEach((linha) => {
    [...linha.children].forEach((celula, i) => {
      if (celula.tagName !== "TD" || celula.colSpan > 1) return;
      const titulo = titulos[i] ?? "";
      if (celula.getAttribute("data-label") !== titulo) {
        celula.setAttribute("data-label", titulo);
      }
    });
  });
}

export function iniciarTabelasDeCelular() {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return;
  let agendado = false;
  const rodar = () => {
    agendado = false;
    document.querySelectorAll("table").forEach(rotular);
  };
  const pedir = () => {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(rodar);
  };
  new MutationObserver(pedir).observe(document.body, {
    childList: true,
    subtree: true,
  });
  pedir();
}
