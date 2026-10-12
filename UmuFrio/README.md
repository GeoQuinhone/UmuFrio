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

### Agendamentos

- Agendamento de cliente com técnico, data e horário.
- O mesmo técnico precisa de no mínimo 1 hora de diferença entre dois
  agendamentos no mesmo dia.
- Cancelamento de agendamentos em aberto.
- Registro de atendimento não realizado (cliente ausente, local fechado etc.),
  com motivo obrigatório.
- Abas **Ativos** e **Concluídos** (concluído = ordem de serviço concluída).
- O técnico vê apenas os próprios agendamentos, já com o nome do cliente.

### Ordens de serviço

- Criação a partir de um agendamento ativo, uma ordem por agendamento.
- Edição (enquanto `aberta`) e exclusão (exceto `concluida`). A exclusão de uma
  ordem em andamento devolve ao estoque as peças debitadas.
- Avanço de status `aberta` → `andamento` → `concluida`, com confirmação.
- Ao entrar em `andamento`, as peças do serviço são debitadas do estoque em uma
  transação. Sem saldo para todas, nada é debitado.
- Peças extras: com a ordem em andamento, é possível descontar do estoque peças
  além das vinculadas ao serviço. O técnico escolhe a peça por uma rota reduzida
  (`/api/produtos/para-tecnico`), que expõe só nome e saldo.
- Linha do tempo (aberta, em andamento, concluída) com data e hora de cada etapa
  na tela de detalhes.

### Interface

- Confirmações de exclusão e cancelamento em modal próprio, com foco preso e
  fechamento por `Esc`.

## Perfis e permissões

| Perfil | Pode |
| --- | --- |
| `ceo` | Tudo, incluindo usuários e exclusões |
| `atendente` | Clientes, serviços, agendamentos e ordens de serviço |
| `estoquista` | Estoque |
| `tecnico` | Ver os próprios agendamentos e ordens, avançar status, descontar peças extras, registrar atendimento não realizado |

## Tecnologias

- **Frontend:** React 18 e Vite
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
    │   ├── utils/        # máscaras e validação de CPF
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
| Agendamentos | `/api/agendamentos` (inclui `PATCH /:id/cancelar` e `PATCH /:id/nao-realizado`) |
| Serviços | `/api/servicos` (inclui `PATCH /:id/status` para inativar e reativar) |
| Ordens de serviço | `/api/ordens-servico` (inclui `PATCH /:id/avancar` e `/:id/pecas-extras`) |
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

Itens combinados após a 2ª orientação e ainda não implementados:

- Rotas por URL (por exemplo `/clientes`) em vez de uma única rota.
- Unificação de Ordem de Serviço e Agendamento em um só fluxo.
- Módulo de pagamento na ordem de serviço: valor cobrado, forma de pagamento,
  confirmação e observação do motivo de cobrança a mais.

## Colaboração

- Repositório: [GeoQuinhone/UmuFrio](https://github.com/GeoQuinhone/UmuFrio)
- Integração com a `main` por Pull Request, com revisão da equipe.