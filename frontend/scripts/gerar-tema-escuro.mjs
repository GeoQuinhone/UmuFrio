// Gera src/dark.css a partir dos CSS do app: para cada regra que usa fundo claro,
// texto escuro ou borda clara, cria o equivalente sob [data-theme="dark"].
// Rodar:  node scripts/gerar-tema-escuro.mjs
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve("src");
const FILES = [
  "styles.css", "mobile.css",
  "pages/auth.css", "pages/catalog-stock.css", "pages/clients-users.css", "pages/despesas.css",
  "pages/institucional.css", "pages/relatorios.css", "pages/scheduling-orders.css",
  "components/chat-widget.css", "components/checkin-panel.css", "components/order-details.css", "components/pix-panel.css",
];

function hexToRgb(h) {
  h = h.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length === 8) h = h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h * 360, s, l];
}
const hsl = (h, s, l) => `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 1000) / 10}%)`;

// fundo claro -> fundo escuro (mesma matiz, bem menos brilho)
function fundo(hex) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  if (l < 0.72) return null;                       // cores médias/escuras (botões, ícones) ficam
  const nl = 0.085 + (1 - l) * 1.25;               // #fff -> ~8,5 %, #e0eaed -> ~ 19 %
  if (s < 0.08) return hsl(204, 0.24, Math.min(nl, 0.30) + 0.03); // branco/cinza -> azul-petróleo escuro
  return hsl(h, Math.min(s, 0.35) * 0.8, Math.min(nl, 0.30));
}
// texto escuro/médio -> texto claro
function texto(hex) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  if (l > 0.62) return null;                       // já é claro (texto sobre botão colorido)
  // Fase 11: texto neutro (cinza, azul-acinzentado, azul-marinho) vira branco puro; só cores vivas
  // (verde, vermelho, âmbar, azul de destaque) continuam coloridas, para manter o significado.
  if (s < 0.55) return "#ffffff";
  if (l < 0.28 && h >= 200 && h <= 235) return "#ffffff"; // azul-marinho da marca
  const nl = Math.min(0.93, 0.98 - l * 0.85);
  return hsl(h, Math.min(s, 0.6), Math.max(nl, 0.62));
}
// bordas claras -> bordas escuras
function borda(hex) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  if (l < 0.7) return null;
  return hsl(h, Math.min(s, 0.25), 0.25);
}

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
const RGBA = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+))?\s*\)/g;

function mapColors(value, fn) {
  let changed = false;
  let out = value.replace(HEX, (m) => { const r = fn(m); if (r) { changed = true; return r; } return m; });
  out = out.replace(RGBA, (m, r, g, b, a) => {
    if (a !== undefined && Number(a) < 0.9) return m; // translúcidos (sobre fundos escuros) ficam como estão
    const hex = "#" + [r, g, b].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
    const res = fn(hex);
    if (!res) return m;
    changed = true;
    if (a !== undefined && Number(a) < 1) return res.replace(/\)$/, ` / ${a})`);
    return res;
  });
  return changed ? out : null;
}
const palavras = { white: "#ffffff" };
function keywords(value) { return value.replace(/\bwhite\b/g, "#ffffff"); }

const BG = /^(background|background-color)$/;
const TXT = /^(color|fill|caret-color|-webkit-text-fill-color)$/;
const BRD = /^(border|border-top|border-bottom|border-left|border-right|border-color|border-top-color|border-bottom-color|border-left-color|border-right-color|outline|outline-color|border-block|border-inline)$/;

// Variáveis do app usadas direto nas regras (valores do tema escuro)
const VAR_FUNDO = { "--surface": "#16232c", "--surface-soft": "#1b2b36", "--page-bg": "#0f1a21", "--uf-surface": "#16232c", "--uf-bg": "#0f1a21", "--ice": "#1b2f3a", "--white": "#16232c" };
const VAR_TEXTO = { "--uf-navy": "#ffffff", "--navy": "#ffffff", "--uf-ink": "#ffffff", "--dark": "#ffffff", "--grey": "#ffffff", "--uf-muted": "#ffffff", "--cu-navy": "#ffffff", "--cu-ink": "#ffffff", "--cu-muted": "#ffffff", "--cu-blue": "#6cc3d3", "--red": "#ff8f82", "--green": "#6fd3a0", "--amber": "#f2c14e", "--deepblue": "#79bde0", "--teal": "#6cc3d3", "--uf-blue": "#6cc3d3", "--uf-teal": "#6cc3d3" };
const VAR_BORDA = { "--uf-line": "#2b3d49", "--border": "#2b3d49" };
function trocarVars(valor, mapa) {
  let mudou = false;
  const out = valor.replace(/var\(\s*(--[\w-]+)\s*(?:,[^()]*)?\)/g, (m, nome) => {
    if (mapa[nome]) { mudou = true; return mapa[nome]; }
    return m;
  });
  return mudou ? out : null;
}

function derivar(decl) {
  const prop = decl.prop;
  const mapa = BG.test(prop) ? VAR_FUNDO : TXT.test(prop) ? VAR_TEXTO : BRD.test(prop) ? VAR_BORDA : null;
  if (mapa && decl.value.includes("var(--")) {
    const viaVar = trocarVars(decl.value, mapa);
    if (viaVar) return viaVar;
  }
  if (decl.value.includes("var(--") && !/#|rgb/.test(decl.value)) return null;
  const v = keywords(decl.value);
  if (BG.test(prop)) return mapColors(v, fundo);
  if (TXT.test(prop)) return mapColors(v, texto);
  if (BRD.test(prop)) return mapColors(v, borda);
  if (prop === "box-shadow") return null;
  return null;
}

function prefixar(selector) {
  return selector.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
    if (/^(html|:root)\b/.test(s)) return s.replace(/^(html|:root)/, '$1[data-theme="dark"]');
    if (/^body\b/.test(s)) return s.replace(/^body/, 'html[data-theme="dark"] body');
    return `html[data-theme="dark"] ${s}`;
  }).join(",\n");
}


// Leitor de CSS mínimo (sem dependências): devolve regras e blocos @media/@supports.
function lerCss(texto) {
  const css = texto.replace(/\/\*[\s\S]*?\*\//g, "");
  let i = 0;
  function bloco() {
    const nos = [];
    while (i < css.length) {
      while (i < css.length && /\s/.test(css[i])) i++;
      if (i >= css.length || css[i] === "}") { i++; return nos; }
      let cab = "";
      while (i < css.length && css[i] !== "{" && css[i] !== ";" && css[i] !== "}") cab += css[i++];
      if (css[i] === ";") { i++; continue; }          // @import ...;
      if (css[i] !== "{") return nos;
      i++;
      cab = cab.trim();
      if (cab.startsWith("@")) {
        const m = cab.match(/^@([\w-]+)\s*(.*)$/s);
        if (/^(media|supports|layer)$/.test(m[1])) nos.push({ tipo: "at", nome: m[1], params: m[2], filhos: bloco() });
        else { let n = 1; while (i < css.length && n) { if (css[i] === "{") n++; else if (css[i] === "}") n--; i++; } }
        continue;
      }
      let corpo = "";
      let prof = 1;
      while (i < css.length && prof) {
        if (css[i] === "{") prof++;
        else if (css[i] === "}") { prof--; if (!prof) { i++; break; } }
        corpo += css[i++];
      }
      const decls = [];
      for (const parte of corpo.split(/;(?![^(]*\))/)) {
        const k = parte.indexOf(":");
        if (k > 0) decls.push({ prop: parte.slice(0, k).trim().toLowerCase(), value: parte.slice(k + 1).trim() });
      }
      nos.push({ tipo: "regra", selector: cab, decls });
    }
    return nos;
  }
  return bloco();
}

let saida = "/* ARQUIVO GERADO por scripts/gerar-tema-escuro.mjs — não edite à mão (use dark-extra.css). */\n";
let total = 0;
function gerar(nos, nivel = 0) {
  const blocos = [];
  for (const no of nos) {
    if (no.tipo === "at") {
      const dentro = gerar(no.filhos, nivel + 1);
      if (dentro.length) blocos.push(`@${no.nome} ${no.params} {\n${dentro.join("\n").replace(/^/gm, "  ")}\n}`);
      continue;
    }
    const decls = [];
    for (const d of no.decls) {
      const novo = derivar(d);
      if (novo) decls.push(`  ${d.prop}: ${novo};`);
    }
    if (!decls.length) continue;
    blocos.push(`${prefixar(no.selector)} {\n${decls.join("\n")}\n}`);
    total++;
  }
  return blocos;
}
for (const f of FILES) {
  const blocos = gerar(lerCss(fs.readFileSync(path.join(SRC, f), "utf8")));
  if (blocos.length) saida += `\n/* ${f} */\n` + blocos.join("\n") + "\n";
}
fs.writeFileSync(path.join(SRC, "dark.css"), saida);
console.log("regras geradas:", total);
