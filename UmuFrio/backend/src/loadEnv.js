import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolve o .env sempre a partir da pasta backend/ (um nível acima de src/),
// independente de qual seja o diretório de trabalho de quem chamou o script.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "..", ".env");

// Implementação própria (sem depender do pacote "dotenv" para a leitura do
// arquivo) porque editores no Windows às vezes salvam o .env em UTF-16 ou
// com BOM, o que fazia o dotenv não reconhecer nenhuma variável mesmo com o
// conteúdo aparentando estar correto no terminal.
function parseEnvFile(filePath) {
  const buf = fs.readFileSync(filePath);
  let text;

  if (buf[0] === 0xff && buf[1] === 0xfe) {
    // UTF-16 LE (com BOM) — comum quando o arquivo é salvo pelo Bloco de
    // Notas ou por "Out-File" do PowerShell no Windows.
    text = buf.slice(2).toString("utf16le");
  } else if (buf[0] === 0xfe && buf[1] === 0xff) {
    // UTF-16 BE (raro, mas por precaução)
    text = buf.slice(2).swap16().toString("utf16le");
  } else {
    text = buf.toString("utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // remove BOM UTF-8
  }

  const result = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
}

let loadedKeys = [];
if (fs.existsSync(envPath)) {
  const parsed = parseEnvFile(envPath);
  loadedKeys = Object.keys(parsed);
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export { envPath, loadedKeys };