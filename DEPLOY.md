# Publicação do UmuFrio

Guia para colocar o sistema na internet sem custo, usando:

| Parte | Serviço | Endereço de exemplo |
| --- | --- | --- |
| Frontend (telas React) | Cloudflare Pages | `https://umufrio.pages.dev` |
| Backend (API Node.js) | Render | `https://umufrio-api.onrender.com` |
| Banco PostgreSQL | Neon | — |

```text
Navegador / celular ──▶ Cloudflare Pages ──▶ Render (API) ──▶ Neon (banco)
```

Os três publicam a partir do GitHub: depois de configurados, cada `git push`
publica a nova versão sozinho.

Os nomes de menus e botões dos painéis mudam com o tempo; se algo não bater
exatamente, procure a opção equivalente.

---

## 1. Código no GitHub

Os serviços leem o código de um repositório. Pode (e deve) ser **privado**.

1. Crie um repositório vazio em <https://github.com/new> (sem README, sem
   .gitignore), marcado como **Private**.
2. Na raiz do projeto (a pasta que contém `backend/` e `frontend/`):

```powershell
git init
git add .
git commit -m "Versão inicial"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
git push -u origin main
```

O `.gitignore` da raiz já impede o envio de `node_modules`, arquivos `.env` e
do `umufrio.sql` (dump antigo com dados pessoais).

---

## 2. Banco no Neon

1. Crie a conta em <https://neon.tech> (pode entrar com o GitHub).
2. Crie um projeto:
   - **Postgres version:** a padrão.
   - **Region:** uma região dos EUA no leste (ex.: *AWS US East*). O banco
     deve ficar perto do backend no Render, não do usuário.
3. No painel do projeto, abra **Connect** e copie a *connection string*. Ela
   tem este formato:

```text
postgresql://usuario:senha@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require
```

Guarde esse valor: ele é o `DATABASE_URL` do próximo passo. **Não** coloque
essa string em nenhum arquivo do repositório.

---

## 3. Backend no Render

1. Crie a conta em <https://render.com> (pode entrar com o GitHub) e autorize o
   acesso ao repositório.
2. **New → Web Service** e escolha o repositório.
3. Preencha:

| Campo | Valor |
| --- | --- |
| Name | `umufrio-api` (vira parte do endereço) |
| Region | **Ohio** ou **Virginia** (perto do banco) |
| Branch | `main` |
| Root Directory | `backend` |
| Runtime | Node |
| Build Command | `npm ci && npm run db:migrate` |
| Start Command | `npm start` |
| Instance Type | **Free** |

4. Em **Environment Variables**, adicione:

| Variável | Valor |
| --- | --- |
| `DATABASE_URL` | a connection string do Neon |
| `SESSION_SECRET` | uma chave aleatória longa (veja abaixo) |
| `NODE_VERSION` | `20` |
| `CORS_ORIGIN` | deixe para o passo 5 |
| `GROQ_API_KEY` | chave do chat com IA (veja o passo 6; sem ela o chat avisa que está indisponível) |
| `CHAT_MODELO` | modelo de IA do chat, ex.: `openai/gpt-oss-20b` (use o mesmo do seu `.env`) |

   Para gerar o `SESSION_SECRET`, rode no seu computador e copie o resultado:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

5. Em **Advanced → Health Check Path**, coloque `/api/health`.
6. Clique em **Create Web Service** e acompanhe os logs. O build roda as
   migrations e cria todas as tabelas no Neon.
7. Quando terminar, abra `https://SEU-SERVICO.onrender.com/api/health`. Deve
   aparecer `{"status":"ok"}`.

> O plano gratuito "dorme" após ~15 minutos sem uso; o primeiro acesso depois
> disso leva de 30 a 60 segundos. Antes de uma apresentação, abra o sistema
> alguns minutos antes.

---

## 4. Frontend no Cloudflare Pages

1. Crie a conta em <https://dash.cloudflare.com>.
2. **Workers & Pages → Create → Pages → Connect to Git** e escolha o
   repositório.
3. Preencha:

| Campo | Valor |
| --- | --- |
| Project name | `umufrio` (vira `umufrio.pages.dev`) |
| Production branch | `main` |
| Framework preset | Vite (ou None) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `frontend` |

4. Em **Environment variables**, adicione:

| Variável | Valor |
| --- | --- |
| `VITE_API_URL` | `https://SEU-SERVICO.onrender.com/api` |
| `NODE_VERSION` | `20` |

5. **Save and Deploy**.

As rotas do React (`/agendamentos/12` etc.) funcionam sem configuração extra:
como o projeto não tem `404.html`, o Cloudflare Pages devolve o `index.html`
para qualquer endereço.

> `VITE_API_URL` entra no build. Se mudar o endereço da API, publique o frontend
> de novo (**Deployments → Retry deployment**).

---

## 5. Ligar frontend e backend (CORS)

1. Copie o endereço do Cloudflare Pages (ex.: `https://umufrio.pages.dev`).
2. No Render, em **Environment**, defina `CORS_ORIGIN` com esse endereço e
   salve. O serviço reinicia sozinho.

Para autorizar mais de um endereço (ex.: um domínio próprio depois), separe por
vírgula: `https://umufrio.pages.dev,https://sistema.umufrio.com.br`.

---

## 6. Chat com IA (Groq)

O chat da tela de login usa uma IA de verdade. A chave fica **só no backend**.

1. Crie a conta em <https://console.groq.com> e gere uma chave em **API Keys →
   Create API Key** (começa com `gsk_`). A faixa gratuita atende a apresentação.
2. No Render, em **Environment**, cadastre `GROQ_API_KEY` com a chave e
   `CHAT_MODELO` com o modelo que funcionou na sua conta (a lista de modelos
   disponíveis aparece em `https://api.groq.com/openai/v1/models`, com a chave).
3. Salve. O serviço reinicia sozinho.
4. Teste: abra `https://SEU-SERVICO.onrender.com/api/chat/config`. Deve aparecer
   `"modo":"ia"`. Se aparecer `"modo":"indisponivel"`, a chave não foi lida.

Sem chave (ou se a IA falhar), o chat avisa que está indisponível e encaminha o
visitante para o WhatsApp (44) 99804-9224. **Nunca** coloque a chave em arquivo
do repositório nem no frontend.

Variáveis opcionais do backend (todas com valor padrão):

| Variável | Para que serve |
| --- | --- |
| `CHAT_WHATSAPP` | número do WhatsApp do chat, só dígitos com DDD (padrão 44998049224) |
| `CHAT_HORARIO`, `CHAT_CIDADE`, `CHAT_EMPRESA_NOME` | textos que o assistente usa nas respostas |
| `CHAT_LIMITE_HORA` | teto de mensagens por hora (todas as pessoas) |
| `CHECKIN_RAIO_METROS` | raio do check-in geolocalizado (padrão 150) |
| `GEOCODING_EMAIL` | e-mail de contato para a busca de endereços (Nominatim) |
| `GUPSHUP_CUSTOMER_SECRET`, `GUPSHUP_APP_ID`, `GUPSHUP_SOURCE`, `GUPSHUP_APP_NAME`, `GUPSHUP_TEMPLATE_*` | aviso automático ao cliente pelo WhatsApp via Gupshup (ver abaixo) |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_*` | alternativa: aviso pela API da Meta direto; usada só se o Gupshup não estiver configurado |

### Aviso automático pelo WhatsApp (Gupshup)

Sem estas variáveis, o sistema continua funcionando: a tela mostra o botão
"Enviar pelo WhatsApp" com a mensagem pronta.

| Variável | Valor |
| --- | --- |
| `GUPSHUP_CUSTOMER_SECRET` | segredo da conta (Gupshup → Painel → Segredo da conta, 64 caracteres). **Segredo**: só no painel do Render. Vale até 90 dias: ao gerar outro, o anterior para de funcionar na hora, então troque aqui no mesmo momento |
| `GUPSHUP_APP_ID` | ID do app no Gupshup (app → Configurações → ID do app) |
| `GUPSHUP_API_KEY` | opcional: chave fixa antiga, usada só se não houver segredo; desligada pelo Gupshup em 31/03/2027 |
| `WHATSAPP_NUMEROS_PERMITIDOS` | **proteção do banco de demonstração**: números (com DDD, separados por vírgula) que podem receber o envio automático, ex.: `44998049224`. Os outros clientes ficam só com o botão "Enviar pelo WhatsApp". **Apague** quando a empresa for usar com clientes reais |
| `GUPSHUP_SOURCE` | número que envia, só dígitos com 55 (ex.: `554498890148`) |
| `GUPSHUP_APP_NAME` | nome do app no Gupshup (ex.: `UmufrioAvisos`) |
| `GUPSHUP_TEMPLATE_INICIADO` | ID do modelo `servico_iniciado` (Modelos → Gerenciar) |
| `GUPSHUP_TEMPLATE_CONCLUIDO` | ID do modelo `servico_concluido` |
| `GUPSHUP_TEMPLATE_NAO_REALIZADO` | ID do modelo `servico_nao_realizado` |

Os três modelos são da categoria **Utilidade**, em **Portuguese (BR)**, com 4
variáveis no corpo, nesta ordem de valores: {{1}} cliente, {{2}} serviço,
{{3}} horário, {{4}} técnico. Cada mensagem é paga pela carteira do Gupshup:
sem saldo, o envio falha e a tela oferece o link wa.me. Com o segredo, o
sistema pede sozinho o token de 24 horas (CAT) e o renova antes de vencer;
basta lembrar de gerar um segredo novo a cada 90 dias e atualizar no Render.

---

## 7. Primeiro usuário (CEO)

O banco publicado começa vazio. **Faça isto logo depois de publicar**: a rota
`bootstrap` só funciona enquanto não existe nenhum usuário, e quem chamar
primeiro vira o CEO.

```powershell
$body = @{
  nome = "Seu Nome"
  email = "voce@exemplo.com"
  cpf = "CPF_VALIDO_SOMENTE_NUMEROS"
  telefone = "(44) 99999-9999"
  senha = "uma-senha-forte"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri https://SEU-SERVICO.onrender.com/api/auth/bootstrap `
  -ContentType "application/json" -Body $body
```

Depois, entre pelo endereço do Cloudflare Pages e cadastre os demais usuários
em **Usuários**.

---

## 8. Testes depois de publicar

- [ ] `/api/health` responde `{"status":"ok"}`
- [ ] Login do CEO
- [ ] Cadastro de cliente (com CEP preenchendo o endereço)
- [ ] Cadastro de produto e serviço com peças
- [ ] Agendamento, iniciar e concluir atendimento
- [ ] Pagamento
- [ ] Login como técnico **pelo celular**
- [ ] Recarregar a página em `/agendamentos` (não pode dar erro 404)
- [ ] `/api/chat/config` mostra `"modo":"ia"` e o chat da tela de login responde
- [ ] Botão de WhatsApp do login e do chat abre `wa.me/5544998049224` com a mensagem pronta
- [ ] Relatórios: baixar o PDF de uma aba e o PDF completo
- [ ] Check-in e check-out do técnico (pelo celular, com a localização liberada)

---

## Atualizações

Basta enviar as mudanças para o GitHub:

```powershell
git add .
git commit -m "Descrição da mudança"
git push
```

O Render e o Cloudflare Pages publicam sozinhos. Migrations novas rodam no build
do Render.

---

## Problemas comuns

| Sintoma | Causa provável |
| --- | --- |
| Tela de login mostra erro de conexão / CORS no console | `CORS_ORIGIN` no Render diferente do endereço do Pages, ou `VITE_API_URL` errado |
| Primeiro acesso demora quase 1 minuto | Backend gratuito "acordando" — normal |
| Build do Render falha com `DATABASE_URL não definida` | Variável não cadastrada no Render |
| Build do Render falha na migration | Connection string do Neon incompleta (confira o `?sslmode=require`) |
| Página em branco no Pages | Build com `VITE_API_URL` ausente ou Root directory diferente de `frontend` |
| Chat mostra "Assistente indisponível" | `GROQ_API_KEY` não cadastrada no Render (confira `/api/chat/config`) |
| Chat responde "Estou com instabilidade" | Veja os logs do Render: `Invalid API Key` = chave errada; `model ... does not exist` = ajuste `CHAT_MODELO` para um modelo liberado na sua conta |
| Check-in não pega a localização | O navegador precisa de HTTPS (o Pages já é) e a permissão de localização liberada |
