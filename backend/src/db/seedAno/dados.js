// Dados-base do seed anual (db:seed-ano): catálogo de produtos e serviços,
// nomes e endereços fictícios de Umuarama. Tudo aqui é inventado.

// chave: usada só dentro do seed. minimo/lote: ponto de reposição e tamanho do
// pedido de compra. repDias: dias úteis que o fornecedor leva para entregar.
export const PRODUTOS = [
  { chave: "r410", nome: "Gás refrigerante R-410A (kg)", valorUnitario: 95, minimo: 4, lote: 10, repDias: 3 },
  { chave: "r22", nome: "Gás refrigerante R-22 (kg)", valorUnitario: 120, minimo: 2, lote: 5, repDias: 3 },
  { chave: "cap355", nome: "Capacitor 35+5 µF", valorUnitario: 45, minimo: 3, lote: 10, repDias: 2 },
  { chave: "cap25", nome: "Capacitor 25 µF", valorUnitario: 38, minimo: 3, lote: 10, repDias: 2 },
  { chave: "filtro", nome: 'Filtro secador 1/4"', valorUnitario: 28, minimo: 4, lote: 12, repDias: 4 },
  { chave: "cobre14", nome: 'Tubulação de cobre 1/4" (metro)', valorUnitario: 32, minimo: 10, lote: 45, repDias: 3 },
  { chave: "cobre38", nome: 'Tubulação de cobre 3/8" (metro)', valorUnitario: 45, minimo: 10, lote: 45, repDias: 4 },
  { chave: "suporte", nome: "Suporte para condensadora", valorUnitario: 85, minimo: 2, lote: 10, repDias: 3 },
  { chave: "espuma", nome: "Espuma isolante (metro)", valorUnitario: 6.5, minimo: 15, lote: 80, repDias: 3 },
  { chave: "limpeza", nome: "Produto de limpeza para serpentina (litro)", valorUnitario: 35, minimo: 5, lote: 20, repDias: 2 },
  { chave: "fita", nome: "Fita PVC para acabamento", valorUnitario: 12, minimo: 5, lote: 30, repDias: 2 },
  { chave: "controle", nome: "Controle remoto universal", valorUnitario: 55, minimo: 2, lote: 8, repDias: 3 },
  { chave: "placa", nome: "Placa eletrônica universal", valorUnitario: 210, minimo: 2, lote: 5, repDias: 5 },
  { chave: "sensor", nome: "Sensor de temperatura (NTC)", valorUnitario: 25, minimo: 3, lote: 12, repDias: 3 },
];

// Produtos que o técnico às vezes precisa além das peças do serviço (peça extra).
export const EXTRAS = [
  { chave: "cap355", peso: 5, qtd: [1, 1] },
  { chave: "cap25", peso: 3, qtd: [1, 1] },
  { chave: "filtro", peso: 4, qtd: [1, 1] },
  { chave: "fita", peso: 4, qtd: [1, 2] },
  { chave: "cobre14", peso: 3, qtd: [1, 3] },
  { chave: "r410", peso: 3, qtd: [1, 1] },
  { chave: "sensor", peso: 2, qtd: [1, 1] },
  { chave: "controle", peso: 1, qtd: [1, 1] },
];

// dur: minutos de atendimento [mín, máx]. Os serviços "anterior" são as
// versões com o valor antigo: ficam INATIVOS e só aparecem em atendimentos
// anteriores a `ate` (mostra o fluxo "inativar o serviço e cadastrar outro com
// o novo valor", combinado na 2ª orientação).
export const MUDANCA_DE_PRECO = "2026-03-01";

export const SERVICOS = [
  { chave: "limpeza12", nome: "Limpeza de split até 12.000 BTUs", descricao: "Limpeza completa das unidades interna e externa.", valor: 180, pecas: { limpeza: 1 }, dur: [55, 95] },
  { chave: "limpeza18", nome: "Limpeza de split acima de 12.000 BTUs", descricao: "Limpeza completa das unidades interna e externa.", valor: 240, pecas: { limpeza: 1 }, dur: [70, 115] },
  { chave: "instalacao12", nome: "Instalação de split 9.000 a 12.000 BTUs", descricao: "Instalação com até 3 metros de tubulação.", valor: 650, pecas: { cobre14: 3, cobre38: 3, suporte: 1, espuma: 6, fita: 2 }, dur: [150, 240] },
  { chave: "instalacao18", nome: "Instalação de split 18.000 a 24.000 BTUs", descricao: "Instalação com até 3 metros de tubulação e suporte reforçado.", valor: 890, pecas: { cobre14: 3, cobre38: 3, suporte: 1, espuma: 6, fita: 2 }, dur: [190, 300] },
  { chave: "recarga", nome: "Recarga de gás R-410A", descricao: "Teste de vazamento e recarga de até 1 kg.", valor: 320, pecas: { r410: 1 }, dur: [45, 80] },
  { chave: "capacitor", nome: "Troca de capacitor", descricao: "Substituição do capacitor da condensadora.", valor: 210, pecas: { cap355: 1 }, dur: [40, 75] },
  { chave: "preventiva", nome: "Manutenção preventiva (PMOC)", descricao: "Limpeza, troca de filtro e relatório técnico.", valor: 280, pecas: { limpeza: 1, filtro: 1 }, dur: [75, 120] },
  { chave: "visita", nome: "Visita técnica / diagnóstico", descricao: "Avaliação do equipamento e orçamento.", valor: 120, pecas: {}, dur: [30, 50] },
  { chave: "retirada", nome: "Retirada de ar-condicionado", descricao: "Remoção do equipamento, recolhimento do gás e da tubulação.", valor: 150, pecas: { fita: 1 }, dur: [60, 100] },
  { chave: "placa", nome: "Reparo em placa eletrônica", descricao: "Troca da placa eletrônica da unidade interna ou externa.", valor: 380, pecas: { placa: 1 }, dur: [60, 110] },
  { chave: "higienizacao", nome: "Higienização com bactericida", descricao: "Higienização completa com produto bactericida.", valor: 160, pecas: { limpeza: 1 }, dur: [50, 80] },

  // Versões antigas (inativas).
  { chave: "limpeza12_antigo", nome: "Limpeza de split até 12.000 BTUs (valor anterior)", descricao: "Valor vigente até fevereiro de 2026.", valor: 150, pecas: { limpeza: 1 }, dur: [55, 95], ativo: 0, substitui: "limpeza12", ate: MUDANCA_DE_PRECO },
  { chave: "limpeza18_antigo", nome: "Limpeza de split acima de 12.000 BTUs (valor anterior)", descricao: "Valor vigente até fevereiro de 2026.", valor: 200, pecas: { limpeza: 1 }, dur: [70, 115], ativo: 0, substitui: "limpeza18", ate: MUDANCA_DE_PRECO },
  { chave: "instalacao12_antigo", nome: "Instalação de split 9.000 a 12.000 BTUs (valor anterior)", descricao: "Valor vigente até fevereiro de 2026.", valor: 580, pecas: { cobre14: 3, cobre38: 3, suporte: 1, espuma: 6, fita: 2 }, dur: [150, 240], ativo: 0, substitui: "instalacao12", ate: MUDANCA_DE_PRECO },
];

// Peso de cada serviço por estação (verão = nov–mar). Instalação e recarga
// sobem no calor; preventiva, limpeza e visita sobem no inverno.
export const PESOS_SERVICO = {
  limpeza12: { verao: 20, meio: 22, inverno: 28 },
  limpeza18: { verao: 8, meio: 9, inverno: 12 },
  instalacao12: { verao: 24, meio: 12, inverno: 5 },
  instalacao18: { verao: 7, meio: 4, inverno: 1.5 },
  recarga: { verao: 13, meio: 9, inverno: 5 },
  capacitor: { verao: 11, meio: 8, inverno: 5 },
  preventiva: { verao: 8, meio: 11, inverno: 17 },
  visita: { verao: 7, meio: 9, inverno: 13 },
  retirada: { verao: 2, meio: 3, inverno: 3 },
  placa: { verao: 4, meio: 3, inverno: 2 },
  higienizacao: { verao: 4, meio: 5, inverno: 6 },
};

// Demanda relativa de cada mês (Umuarama é quente: pico de outubro a março).
export const SAZONALIDADE = {
  1: 1.25, 2: 1.2, 3: 1.1, 4: 0.9, 5: 0.7, 6: 0.55,
  7: 0.5, 8: 0.65, 9: 0.9, 10: 1.15, 11: 1.3, 12: 1.3,
};

export const PRIMEIROS_M = ["João", "José", "Carlos", "Marcos", "Paulo", "Lucas", "Rafael", "Fernando", "Ricardo", "Eduardo", "André", "Thiago", "Gustavo", "Bruno", "Felipe", "Rodrigo", "Leandro", "Diego", "Marcelo", "Alexandre", "Sérgio", "Antônio", "Roberto", "Daniel", "Vinícius", "Gabriel", "Matheus", "Henrique", "Renato", "Fábio", "Wellington", "Adriano"];
export const PRIMEIROS_F = ["Maria", "Ana", "Juliana", "Patrícia", "Fernanda", "Camila", "Aline", "Beatriz", "Luciana", "Carla", "Mariana", "Renata", "Adriana", "Cristiane", "Simone", "Tatiane", "Larissa", "Vanessa", "Débora", "Priscila", "Letícia", "Bianca", "Eliane", "Sandra", "Cláudia", "Rosana", "Elaine", "Michele", "Raquel", "Jéssica"];
export const SOBRENOMES = ["Silva", "Santos", "Oliveira", "Souza", "Pereira", "Lima", "Costa", "Ferreira", "Rodrigues", "Almeida", "Nascimento", "Carvalho", "Gomes", "Martins", "Araújo", "Ribeiro", "Barbosa", "Moreira", "Cardoso", "Teixeira", "Mendes", "Rocha", "Dias", "Nunes", "Moraes", "Freitas", "Pinto", "Correia", "Machado", "Campos", "Batista", "Monteiro", "Fonseca", "Vieira", "Melo", "Cavalcante", "Azevedo", "Borges", "Prado", "Ramos"];

export const EMPRESAS = [
  { nome: "Padaria Pão Dourado", intervalo: 90 },
  { nome: "Clínica Sorriso Odontologia", intervalo: 60 },
  { nome: "Restaurante Sabor da Terra", intervalo: 60 },
  { nome: "Escritório Contábil Horizonte", intervalo: 90 },
  { nome: "Farmácia Vida Plena", intervalo: 90 },
  { nome: "Loja Moda Center", intervalo: 90 },
  { nome: "Academia Corpo em Movimento", intervalo: 60 },
  { nome: "Supermercado Bom Preço", intervalo: 60 },
  { nome: "Pet Shop Amigo Fiel", intervalo: 120 },
  { nome: "Salão Beleza Pura", intervalo: 120 },
  { nome: "Hotel Praça Central", intervalo: 60 },
  { nome: "Consultório Dr. Mendes", intervalo: 120 },
  { nome: "Auto Peças Umuarama", intervalo: 120 },
  { nome: "Imobiliária Lar Certo", intervalo: 120 },
  { nome: "Escola Pequeno Aprendiz", intervalo: 90 },
  { nome: "Laboratório Análises Vida", intervalo: 60 },
  { nome: "Cantina da Praça", intervalo: 90 },
  { nome: "Sorveteria Gelato Mania", intervalo: 90 },
  { nome: "Mercadinho São José", intervalo: 120 },
  { nome: "Óptica Visão Clara", intervalo: 120 },
];

export const RUAS = ["Avenida Paraná", "Avenida Rio Branco", "Avenida Presidente Castelo Branco", "Avenida Ângelo Moreira da Fonseca", "Rua Desembargador Munhoz de Mello", "Rua Ministro Oliveira Salazar", "Rua Doutor Camargo", "Rua Santos Dumont", "Rua Peru", "Rua Espírito Santo", "Rua Pernambuco", "Rua Bahia", "Rua Goiás", "Rua Mato Grosso", "Rua Alagoas", "Rua das Américas", "Avenida Brasil", "Rua Rio Grande do Sul", "Avenida Maringá", "Rua São Paulo", "Rua Minas Gerais", "Rua Santa Catarina", "Rua Piauí", "Rua Sergipe"];

// cep: 5 primeiros dígitos; dLat/dLng: deslocamento aproximado do centro, em
// graus (0,01° ≈ 1,1 km), para as coordenadas dos clientes.
export const BAIRROS = [
  { nome: "Zona I", cep: "87501", dLat: 0.004, dLng: -0.004 },
  { nome: "Zona II", cep: "87502", dLat: -0.006, dLng: 0.003 },
  { nome: "Zona III", cep: "87503", dLat: 0.012, dLng: 0.008 },
  { nome: "Zona IV", cep: "87504", dLat: -0.012, dLng: -0.01 },
  { nome: "Zona V", cep: "87505", dLat: 0.006, dLng: 0.016 },
  { nome: "Centro", cep: "87501", dLat: 0, dLng: 0 },
  { nome: "Jardim Panorama", cep: "87506", dLat: 0.018, dLng: -0.012 },
  { nome: "Jardim Ipanema", cep: "87507", dLat: -0.018, dLng: 0.012 },
  { nome: "Parque Danielle", cep: "87508", dLat: -0.008, dLng: -0.02 },
  { nome: "Jardim Tropical", cep: "87509", dLat: 0.02, dLng: 0.02 },
  { nome: "Jardim Cruzeiro", cep: "87506", dLat: -0.022, dLng: -0.004 },
  { nome: "Jardim América", cep: "87507", dLat: 0.01, dLng: -0.022 },
];

export const CENTRO_UMUARAMA = { lat: -23.765, lng: -53.325 };

export const MOTIVOS_NAO_REALIZADO = [
  { texto: "Cliente ausente no horário combinado.", peso: 5 },
  { texto: "Local fechado, ninguém atendeu.", peso: 3 },
  { texto: "Cliente pediu para remarcar por telefone.", peso: 3 },
  { texto: "Endereço não localizado.", peso: 1 },
  { texto: "Chuva forte impediu o serviço externo.", peso: 2 },
  { texto: "Falta de energia no local.", peso: 1 },
  { texto: "Equipamento já havia sido consertado por outro técnico.", peso: 1 },
];

export const OBS_ACRESCIMO = [
  "Peça adicional cobrada à parte.",
  "Deslocamento para fora da cidade.",
  "Serviço adicional: limpeza do dreno.",
  "Atendimento fora do horário comercial.",
];
export const OBS_DESCONTO = [
  "Desconto combinado com o cliente.",
  "Desconto por indicação de outro cliente.",
  "Desconto de fidelidade (cliente recorrente).",
  "Desconto por serviços em mais de um aparelho.",
];

export const JUSTIFICATIVAS_FORA_DO_RAIO = [
  "Sem vaga em frente ao local, estacionei na rua de trás.",
  "Condomínio com portaria distante da unidade.",
  "Sinal de GPS fraco dentro do prédio.",
  "Cliente pediu que o serviço fosse feito na casa dos fundos.",
];

export const FORMAS_PAGAMENTO = [
  { forma: "pix", peso: 40 },
  { forma: "cartao_credito", peso: 22 },
  { forma: "cartao_debito", peso: 14 },
  { forma: "dinheiro", peso: 24 },
];

export const USUARIOS_BASE = [
  { email: "ceo@umufrio.com.br", nome: "Fernanda Objetivo", telefone: "(44) 99101-0001", perfil: "ceo", cpf: "11122233344" },
  { email: "atendente@umufrio.com.br", nome: "Bruno Aguiar", telefone: "(44) 99101-0002", perfil: "atendente", cpf: "22233344455" },
  { email: "estoque@umufrio.com.br", nome: "Carla Nunes", telefone: "(44) 99101-0003", perfil: "estoquista", cpf: "33344455566" },
  { email: "tecnico1@umufrio.com.br", nome: "Diego Torres", telefone: "(44) 99101-0004", perfil: "tecnico", cpf: "44455566677" },
  { email: "tecnico2@umufrio.com.br", nome: "Eduarda Lima", telefone: "(44) 99101-0005", perfil: "tecnico", cpf: "55566677788" },
  { email: "tecnico3@umufrio.com.br", nome: "Henrique Matos", telefone: "(44) 99101-0006", perfil: "tecnico", cpf: null },
  { email: "tecnico4@umufrio.com.br", nome: "Priscila Andrade", telefone: "(44) 99101-0007", perfil: "tecnico", cpf: null },
];

export const VEICULOS = [
  { placa: "BEE4R22", marca: "Fiat", modelo: "Strada", ano: 2022 },
  { placa: "AYK8J51", marca: "Volkswagen", modelo: "Saveiro", ano: 2021 },
  { placa: "RTM2C45", marca: "Fiat", modelo: "Fiorino", ano: 2023 },
  { placa: "QWE5B67", marca: "Renault", modelo: "Kangoo", ano: 2020 },
  { placa: "MFR3021", marca: "Fiat", modelo: "Fiorino", ano: 2018, status: "manutencao", semTecnico: true },
  { placa: "HOP7A19", marca: "Ford", modelo: "Courier", ano: 2014, status: "inativo", semTecnico: true },
];
