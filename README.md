# UmuFrio

Sistema web para apoiar a gestão de uma empresa de manutenção de ar-condicionado
e refrigeração. Reúne clientes, serviços, estoque, agendamentos e ordens de
serviço em uma aplicação com frontend React, API Node.js e banco PostgreSQL.

Projeto de TCC do curso de Tecnologia em Sistemas para Internet (UniALFA).

## Funcionalidades

### Acesso e usuários

- Login com e-mail e senha, controle de acesso por perfil e troca de senha no
  primeiro acesso.
- Perfis: `ceo`, `atendente`, `estoquista` e `tecnico`.
- Bloqueio temporário do usuário após 5 tentativas de login inválidas.
- Recuperação de senha informando apenas o e-mail cadastrado.
- Gerenciamento de usuários (somente `ceo`).
- Não há cadastro público de contas na tela de login. O primeiro `ceo` é criado
  uma única vez pelo endpoint `POST /api/auth/bootstrap` (veja
  [Primeiro usuário](#primeiro-usuário-ceo)).

### Clientes

- Cadastro com CPF validado pelo dígito verificador, telefone, CEP com
  preenchimento automático do endereço (ViaCEP) e tipo de residência.
- Máscaras automáticas de CPF, telefone e CEP nos formulários.
- Ativação e inativação, preservando o histórico.
- Cadastro rápido de cliente direto na tela de Agendamentos.

### Serviços

- Cadastro com valor (máscara monetária) e peças necessárias, com a quantidade
  de cada uma.
- O valor de um serviço não é editado depois de criado. Se o preço mudar, o
  serviço antigo é inativado e um novo é cadastrado, preservando o histórico das
  ordens já abertas.

### Estoque

- Cadastro e edição de produtos com valor unitário (máscara monetária), saldo e
  quantidade mínima.
- Entradas e saídas, sem permitir saída acima do saldo.
- Alertas de estoque mínimo.

### Agendamentos e ordens de serviço (fluxo único)

Agendamento e ordem de serviço (OS) são um fluxo só, na tela **Agendamentos**:
ao agendar, escolhe-se também o serviço e o sistema já cria a OS vinculada.

- Agendamento de cliente com serviço, técnico, data e horário.
- O mesmo técnico precisa de no mínimo 1 hora de diferença entre dois
  agendamentos no mesmo dia.
- Edição (cliente, serviço, técnico, data e horário) enquanto o atendimento não
  foi iniciado.
- Cancelamento e registro de atendimento não realizado (cliente ausente, local
  fechado etc., com motivo obrigatório), também antes de iniciar. A OS ainda
  aberta é removida junto.
- Avanço do atendimento com confirmação: **Agendado** → **Em andamento** →
  **Concluído**. Ao entrar em andamento, as peças do serviço são debitadas do
  estoque em uma transação; sem saldo para todas, nada é debitado.
- Peças extras: com o atendimento em andamento, é possível descontar do estoque
  peças além das vinculadas ao serviço. O técnico escolhe a peça por uma rota
  reduzida (`/api/produtos/para-tecnico`), que expõe só nome e saldo.
- Linha do tempo (agendado, em andamento, concluído) com data e hora de cada
  etapa, na tela de detalhes.
- Abas **Ativos**, **Concluídos** e **Cancelados**, com busca e filtros, e
  cartões de resumo (agendados, em andamento, concluídos e pagamento pendente).
- Exclusão definitiva (somente `ceo`) de atendimentos não concluídos; se estava
  em andamento, as peças voltam ao estoque. Atendimentos concluídos não podem ser
  excluídos, para preservar o histórico de estoque e de pagamento.
- O técnico vê apenas os próprios atendimentos, já com nome do cliente e serviço.
- Agendamentos antigos, criados antes da unificação e sem OS, continuam
  aparecendo; ao editá-los, o serviço escolhido gera a OS.

### Pagamento

- Disponível com o atendimento em andamento ou concluído.
- Campos: **valor cobrado** (nasce igual ao valor do serviço e pode ser
  alterado), **forma de pagamento** (dinheiro, PIX, cartão de débito ou
  crédito), **pagamento confirmado** e **observação**.
- Se o valor cobrado for diferente do valor do serviço, a observação com o motivo
  é obrigatória.
- Para confirmar o pagamento é preciso informar a forma de pagamento.
- Depois de confirmado, somente o `ceo` pode alterar o pagamento.
- Por padrão o atendimento pode ser concluído com o pagamento pendente (a tela
  avisa). Para exigir o pagamento confirmado antes de concluir, defina
  `EXIGIR_PAGAMENTO_PARA_CONCLUIR=true` no `.env` do backend.
- O painel inicial do `ceo` mostra o faturamento do mês (pagamentos confirmados)
  e o valor a receber.

### Interface

- Confirmações de exclusão e cancelamento em modal próprio, com foco preso e
  fechamento por `Esc`.
- Navegação por URL (React Router): cada módulo tem endereço próprio, funciona
  com os botões voltar e avançar do navegador e permite abrir um link direto.

| Endereço | Tela |
| --- | --- |
| `/` | Início (painel) |
| `/clientes` | Clientes |
| `/usuarios` | Usuários (somente `ceo`) |
| `/servicos` | Serviços |
| `/estoque` | Estoque |
| `/agendamentos` | Lista de agendamentos e ordens |
| `/agendamentos/novo` | Novo agendamento |
| `/agendamentos/12` | Detalhes do atendimento 12 |
| `/agendamentos/12/editar` | Edição do atendimento 12 |
| `/agendamentos/12/pagamento` | Pagamento do atendimento 12 |

Endereços inexistentes ou sem permissão voltam para o início. `/ordens-servico`
redireciona para `/agendamentos`.

## Perfis e permissões

| Perfil | Pode |
| --- | --- |
| `ceo` | Tudo, incluindo usuários e exclusões |
| `atendente` | Clientes, serviços e agendamentos (com ordem de serviço e pagamento) |
| `estoquista` | Estoque |
| `tecnico` | Ver os próprios atendimentos, iniciar e concluir, descontar peças extras, registrar pagamento e atendimento não realizado |

## Tecnologias

- **Frontend:** React 18, React Router e Vite
- **Backend:** Node.js e Express
- **Acesso a dados:** Drizzle ORM e `pg`
- **Banco:** PostgreSQL
- **Autenticação:** token assinado (HMAC-SHA256) e senhas com scrypt

## Estrutura

```text
UmuFrio/
├── backend/
│   ├── src/
│   │   ├── db/           # conexão, schema (Drizzle) e migrations
│   │   ├── middleware/   # tratamento de erros
│   │   ├── routes/       # rotas da API
│   │   ├── ordemHelpers.js  # exclusão de OS com devolução ao estoque
│   │   ├── security.js   # auth, perfis, senha e validação de CPF
│   │   ├── app.js
│   │   └── server.js
│   ├── .env.example
│   └── package.json
└── frontend/
    ├── src/
    │   ├── components/   # layout, ícones, diálogos reutilizáveis
    │   ├── hooks/        # useApiCrud
    │   ├── pages/        # uma página por módulo
    │   ├── utils/        # máscaras, validação de CPF e regras do atendimento
    │   ├── routes.js     # mapa das rotas de URL e permissões do menu
    │   └── App.jsx
    ├── .env.example
    └── package.json
```

## API

| Recurso | Caminho |
| --- | --- |
| Verificação | `GET /api/health` |
| Autenticação | `/api/auth` |
| Clientes | `/api/clientes` |
| Usuários | `/api/usuarios` |
| Agendamentos (com a OS) | `/api/agendamentos` (inclui `PUT /:id`, `DELETE /:id`, `PATCH /:id/cancelar` e `PATCH /:id/nao-realizado`) |
| Serviços | `/api/servicos` (inclui `PATCH /:id/status` para inativar e reativar) |
| Ordens de serviço | `/api/ordens-servico` (inclui `PATCH /:id/avancar`, `PATCH /:id/pagamento` e `/:id/pecas-extras`) |
| Produtos e estoque | `/api/produtos` |

## Como executar localmente

### Pré-requisitos

- Node.js e npm
- PostgreSQL em execução, com um banco criado para o projeto

### 1. Backend

```powershell
cd backend
npm install
Copy-Item .env.example .env
```

Edite `backend/.env`:

```env
DATABASE_URL=postgresql://USUARIO:SENHA@localhost:5432/NOME_DO_BANCO
SESSION_SECRET=uma-chave-local-secreta-com-pelo-menos-32-caracteres
PORT=3001
```

Aplique as migrations e inicie a API:

```powershell
npm run db:migrate
npm run dev
```

A API sobe em `http://localhost:3001`. Teste em `http://localhost:3001/api/health`.

As migrations são incrementais e registradas em `umufrio_schema_migrations`.
Ao atualizar o código, rode `npm run db:migrate` de novo para criar as colunas
novas.

### 2. Frontend

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

O Vite mostra o endereço, normalmente `http://localhost:5173`. O `.env` do
frontend aponta a API por `VITE_API_URL` (padrão `http://localhost:3001/api`).

Como a navegação usa URLs reais, ao publicar o frontend em um servidor é preciso
configurar o fallback de SPA: qualquer endereço desconhecido deve devolver o
`index.html` (o servidor de desenvolvimento do Vite já faz isso).

### Primeiro usuário (CEO)

Com o banco vazio, crie o primeiro `ceo` uma única vez. O endpoint só funciona
enquanto não existe nenhum usuário:

```powershell
$body = @{
  nome = "Seu Nome"
  email = "voce@exemplo.com"
  cpf = "CPF_VALIDO_SOMENTE_NUMEROS"
  telefone = "(44) 99999-9999"
  senha = "minimo6"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/auth/bootstrap `
  -ContentType "application/json" -Body $body
```

O CPF precisa ser válido (dígito verificador). Depois, entre pela tela de login e
cadastre os demais usuários em **Usuários**.

## Verificações

No `backend/`:

```powershell
npm run check
npm test
```

`npm run check` verifica a sintaxe de `app.js` e `server.js`. `npm test` roda os
testes Node.js do projeto.

## Segurança

- Não envie o `.env` ao GitHub. Troque o `SESSION_SECRET` e a senha do banco do
  exemplo antes de qualquer uso fora do ambiente local.
- Antes de publicar ou usar dados reais, revise autenticação, sessão, controle de
  acesso e segredos, e configure backups do PostgreSQL.

## Próximos passos

Ideias da Fase 2 do TCC ainda não implementadas:

- Pagamento online (por exemplo PIX ou Mercado Pago). Hoje o pagamento é
  registrado manualmente, com forma e confirmação.
- Relatórios estratégicos, a partir dos dados de atendimentos, pagamentos e estoque.
- Check-in e check-out geolocalizado do técnico.
- Integração com WhatsApp.

## Colaboração

- Repositório: [GeoQuinhone/UmuFrio](https://github.com/GeoQuinhone/UmuFrio)
- Integração com a `main` por Pull Request, com revisão da equipe.
