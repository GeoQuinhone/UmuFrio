// Gerador de PDF mínimo, sem dependências (Fase 6). Cobre só o que os
// relatórios precisam: texto (Helvetica e Helvetica-Bold), retângulos e linhas,
// em A4. Acentos do português funcionam porque a fonte usa a codificação
// WinAnsi. Coordenadas em pontos, origem no canto superior esquerdo.

export const PAGINA = { largura: 595.28, altura: 841.89 };

// Larguras (1/1000 de em) dos caracteres ASCII 32..126 das fontes padrão.
const W_REG = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const W_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

// Caracteres fora do Latin-1 que a codificação WinAnsi também tem.
const ESPECIAIS = {
  "–": 150, "—": 151, "‘": 145, "’": 146, "“": 147, "”": 148,
  "•": 149, "…": 133, "€": 128,
};
const LARGURA_ESPECIAL = { 150: 556, 151: 1000, 145: 222, 146: 222, 147: 333, 148: 333, 149: 350, 133: 1000, 128: 556 };
const BASE_ACENTO = {
  "ÀÁÂÃÄÅ": "A", "ÈÉÊË": "E", "ÌÍÎÏ": "I", "ÒÓÔÕÖ": "O", "ÙÚÛÜ": "U", "Ç": "C", "Ñ": "N", "Ý": "Y",
  "àáâãäå": "a", "èéêë": "e", "ìíîï": "i", "òóôõö": "o", "ùúûü": "u", "ç": "c", "ñ": "n", "ýÿ": "y",
};

function codigo(caractere) {
  const c = caractere.charCodeAt(0);
  if (c === 0xa0) return 32;
  if (c >= 32 && c <= 126) return c;
  if (ESPECIAIS[caractere]) return ESPECIAIS[caractere];
  if (c >= 160 && c <= 255) return c;
  return 63; // "?"
}

function larguraCodigo(cod, negrito) {
  const tabela = negrito ? W_BOLD : W_REG;
  if (cod >= 32 && cod <= 126) return tabela[cod - 32];
  if (LARGURA_ESPECIAL[cod]) return LARGURA_ESPECIAL[cod];
  if (cod === 215) return 584; // ×
  if (cod === 183) return 278; // ·
  const letra = String.fromCharCode(cod);
  for (const [grupo, base] of Object.entries(BASE_ACENTO)) {
    if (grupo.includes(letra)) return tabela[base.charCodeAt(0) - 32];
  }
  return 556;
}

export function larguraTexto(texto, tamanho, negrito = false) {
  let total = 0;
  for (const caractere of String(texto)) total += larguraCodigo(codigo(caractere), negrito);
  return (total * tamanho) / 1000;
}

function literal(texto) {
  let saida = "";
  for (const caractere of String(texto)) {
    const cod = codigo(caractere);
    if (cod === 40 || cod === 41 || cod === 92) saida += "\\" + String.fromCharCode(cod);
    else if (cod > 126) saida += "\\" + cod.toString(8).padStart(3, "0");
    else saida += String.fromCharCode(cod);
  }
  return `(${saida})`;
}

function rgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4]
    .map((i) => (parseInt(h.slice(i, i + 2), 16) / 255).toFixed(3))
    .join(" ");
}

const n = (v) => Number(v).toFixed(2);

export class PdfDoc {
  constructor() {
    this.paginas = [];
    this.ops = null;
    this.rodape = null; // (doc, numero, total) => void, desenha em cada página
    this.novaPagina();
  }

  novaPagina() {
    this.ops = [];
    this.paginas.push(this.ops);
    return this.paginas.length;
  }

  get numeroPagina() {
    return this.paginas.length;
  }

  retangulo(x, y, w, h, { fill, stroke, espessura = 0.6 } = {}) {
    const py = PAGINA.altura - y - h;
    const partes = [];
    if (fill) partes.push(`${rgb(fill)} rg`);
    if (stroke) partes.push(`${rgb(stroke)} RG ${n(espessura)} w`);
    partes.push(`${n(x)} ${n(py)} ${n(w)} ${n(h)} re`);
    partes.push(fill && stroke ? "B" : fill ? "f" : "S");
    this.ops.push(partes.join("\n"));
  }

  linha(x1, y1, x2, y2, { cor = "#cfd8dc", espessura = 0.6 } = {}) {
    this.ops.push(
      `${rgb(cor)} RG ${n(espessura)} w ${n(x1)} ${n(PAGINA.altura - y1)} m ${n(x2)} ${n(PAGINA.altura - y2)} l S`,
    );
  }

  // y é a linha de base do texto, medida do topo da página.
  texto(conteudo, x, y, { tamanho = 10, negrito = false, cor = "#1f3037", alinhar = "esquerda" } = {}) {
    const texto = String(conteudo);
    const largura = larguraTexto(texto, tamanho, negrito);
    let px = x;
    if (alinhar === "direita") px = x - largura;
    if (alinhar === "centro") px = x - largura / 2;
    this.ops.push(
      `BT ${rgb(cor)} rg /${negrito ? "F2" : "F1"} ${n(tamanho)} Tf ${n(px)} ${n(PAGINA.altura - y)} Td ${literal(texto)} Tj ET`,
    );
  }

  // Quebra em linhas que cabem em larguraMax.
  quebrar(conteudo, larguraMax, tamanho = 10, negrito = false) {
    const linhas = [];
    for (const paragrafo of String(conteudo).split("\n")) {
      let atual = "";
      for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
        const tentativa = atual ? `${atual} ${palavra}` : palavra;
        if (larguraTexto(tentativa, tamanho, negrito) <= larguraMax || !atual) atual = tentativa;
        else {
          linhas.push(atual);
          atual = palavra;
        }
      }
      linhas.push(atual);
    }
    return linhas;
  }

  // Reduz o texto com "…" até caber.
  ajustar(conteudo, larguraMax, tamanho = 10, negrito = false) {
    let t = String(conteudo);
    if (larguraTexto(t, tamanho, negrito) <= larguraMax) return t;
    while (t.length > 1 && larguraTexto(`${t}…`, tamanho, negrito) > larguraMax) t = t.slice(0, -1);
    return `${t}…`;
  }

  gerar() {
    const total = this.paginas.length;
    if (this.rodape) {
      const original = this.ops;
      this.paginas.forEach((ops, i) => {
        this.ops = ops;
        this.rodape(this, i + 1, total);
      });
      this.ops = original;
    }

    const objetos = [];
    const add = (corpo) => objetos.push(corpo) && objetos.length;
    const catalogo = add("");
    const arvore = add("");
    const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const ids = [];
    for (const ops of this.paginas) {
      const fluxo = ops.join("\n");
      const conteudo = add(`<< /Length ${fluxo.length} >>\nstream\n${fluxo}\nendstream`);
      ids.push(
        add(
          `<< /Type /Page /Parent ${arvore} 0 R /MediaBox [0 0 ${n(PAGINA.largura)} ${n(PAGINA.altura)}] ` +
            `/Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${conteudo} 0 R >>`,
        ),
      );
    }
    objetos[catalogo - 1] = `<< /Type /Catalog /Pages ${arvore} 0 R >>`;
    objetos[arvore - 1] = `<< /Type /Pages /Kids [${ids.map((i) => `${i} 0 R`).join(" ")}] /Count ${ids.length} >>`;

    let pdf = "%PDF-1.4\n";
    const posicoes = [];
    objetos.forEach((corpo, i) => {
      posicoes.push(pdf.length);
      pdf += `${i + 1} 0 obj\n${corpo}\nendobj\n`;
    });
    const inicioXref = pdf.length;
    pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
    for (const p of posicoes) pdf += `${String(p).padStart(10, "0")} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objetos.length + 1} /Root ${catalogo} 0 R >>\nstartxref\n${inicioXref}\n%%EOF`;

    // Todo o conteúdo é ASCII (acentos viram escapes octais).
    const bytes = new Uint8Array(pdf.length);
    for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
    return bytes;
  }
}
