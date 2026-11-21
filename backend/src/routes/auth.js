// Rotas de autenticação (/api/auth): login, criação do primeiro CEO, dados do usuário logado e troca de senha.
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, pool } from "../db/client.js";
import { usuarios } from "../db/schema.js";
import { nomePessoaValido } from "../validacoes.js";
import {
  hashPassword,
  onlyDigits,
  requireAuth,
  signToken,
  verifyPassword,
  cpfValido,
} from "../security.js";

// Cria o roteador deste módulo.
const router = Router();

// Remove do usuário os campos sensíveis (hash da senha, tentativas e bloqueio) antes de enviar ao front.
const safe = (user) =>
  Object.fromEntries(
    Object.entries(user).filter(
      ([key]) =>
        ![
          "senhaHash",
          "senha_hash",
          "falhasLogin",
          "falhas_login",
          "bloqueadoAte",
          "bloqueado_ate",
        ].includes(key),
    ),
  );

// POST /api/auth/login — confere e-mail e senha e devolve o token de acesso.
router.post("/login", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const senha = String(req.body.senha || "");

    if (!email || !senha) {
      return res.status(400).json({
        error: "Informe e-mail e senha.",
      });
    }

    // Busca o usuário pelo e-mail; e-mail inexistente ou usuário inativo recebe a mesma mensagem genérica.
    const [usuario] = await db
      .select()
      .from(usuarios)
      .where(eq(usuarios.email, email));

    if (!usuario || !usuario.ativo) {
      return res.status(401).json({
        error: "E-mail ou senha inválidos.",
      });
    }

    // Se o usuário está bloqueado por tentativas erradas, responde 423 até o fim do bloqueio.
    if (
      usuario.bloqueadoAte &&
      new Date(usuario.bloqueadoAte) > new Date()
    ) {
      return res.status(423).json({
        error: "Usuário temporariamente bloqueado.",
      });
    }

    // Senha errada: soma uma falha e, na 5ª, bloqueia o usuário por 15 minutos.
    const senhaValida = verifyPassword(senha, usuario.senhaHash);

    if (!senhaValida) {
      const falhas = (usuario.falhasLogin || 0) + 1;

      await db
        .update(usuarios)
        .set({
          falhasLogin: falhas,
          bloqueadoAte:
            falhas >= 5
              ? new Date(Date.now() + 15 * 60 * 1000)
              : null,
        })
        .where(eq(usuarios.id, usuario.id));

      return res.status(401).json({
        error: "E-mail ou senha inválidos.",
      });
    }

    // Senha certa: zera as falhas e o bloqueio.
    await db
      .update(usuarios)
      .set({
        falhasLogin: 0,
        bloqueadoAte: null,
      })
      .where(eq(usuarios.id, usuario.id));

    // Devolve o token de login e os dados do usuário.
    return res.json({
      token: signToken(usuario),
      usuario: safe(usuario),
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/bootstrap — cria o primeiro CEO do sistema; só funciona enquanto não existir nenhum usuário.
router.post("/bootstrap", async (req, res, next) => {
  let client;

  try {
    client = await pool.connect();

    await client.query("BEGIN");

    // Trava a operação para duas pessoas não criarem o primeiro CEO ao mesmo tempo.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('umufrio:ceo-bootstrap'))",
    );

    // Se já existe algum usuário, recusa (409).
    const count = await client.query(
      "SELECT count(*)::int AS total FROM usuarios",
    );

    if (count.rows[0].total !== 0) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        error: "O CEO inicial já foi criado.",
      });
    }

    // Lê e limpa os dados enviados e valida nome, e-mail, CPF, telefone e senha.
    const nome = String(req.body.nome || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const cpf = onlyDigits(req.body.cpf);
    const telefone = String(req.body.telefone || "").trim();
    const senha = String(req.body.senha || "");

    if (
      !nomePessoaValido(nome) ||
      !email ||
      !cpfValido(cpf) ||
      !telefone ||
      senha.length < 6
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        error:
          "Informe nome (só letras), e-mail, CPF válido, telefone e senha com no mínimo 6 caracteres.",
      });
    }

    // Grava o CEO com senha criptografada e já devolve o token de login.
    const senhaHash = hashPassword(senha);

    const result = await client.query(
      `
        INSERT INTO usuarios (
          nome,
          email,
          cpf,
          senha_hash,
          telefone,
          perfil,
          primeiro_acesso
        )
        VALUES ($1, $2, $3, $4, $5, 'ceo', 0)
        RETURNING
          id,
          nome,
          email,
          cpf,
          telefone,
          perfil,
          criado_em,
          ativo,
          primeiro_acesso,
          falhas_login,
          bloqueado_ate
      `,
      [nome, email, cpf, senhaHash, telefone],
    );

    await client.query("COMMIT");

    const usuario = result.rows[0];

    return res.status(201).json({
      token: signToken(usuario),
      usuario: safe(usuario),
    });
  // Em caso de erro desfaz a transação; no final sempre libera a conexão com o banco.
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK");
    }

    next(error);
  } finally {
    if (client) {
      client.release();
    }
  }
});

// GET /api/auth/me — devolve os dados atualizados do usuário logado.
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const [usuario] = await db
      .select()
      .from(usuarios)
      .where(eq(usuarios.id, req.usuario.id));

    if (!usuario) {
      return res.status(404).json({
        error: "Usuário não encontrado.",
      });
    }

    return res.json(safe(usuario));
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/trocar-senha — troca a senha do usuário logado (obrigatória no primeiro acesso).
router.post("/trocar-senha", requireAuth, async (req, res, next) => {
  try {
    const senhaAtual = String(req.body.senhaAtual || "");
    const novaSenha = String(req.body.novaSenha || "");

    // A nova senha precisa ter pelo menos 6 caracteres.
    if (novaSenha.length < 6) {
      return res.status(400).json({
        error: "A nova senha deve ter no mínimo 6 caracteres.",
      });
    }

    const [usuario] = await db
      .select()
      .from(usuarios)
      .where(eq(usuarios.id, req.usuario.id));

    if (!usuario) {
      return res.status(404).json({
        error: "Usuário não encontrado.",
      });
    }

    // Fora do primeiro acesso, exige a senha atual correta antes de trocar.
    if (
      !req.usuario.primeiroAcesso &&
      !verifyPassword(senhaAtual, usuario.senhaHash)
    ) {
      return res.status(401).json({
        error: "Informe a senha atual correta.",
      });
    }

    // Grava a nova senha criptografada e tira a marca de "primeiro acesso".
    await db
      .update(usuarios)
      .set({
        senhaHash: hashPassword(novaSenha),
        primeiroAcesso: 0,
      })
      .where(eq(usuarios.id, req.usuario.id));

    return res.json({
      sucesso: true,
    });
  } catch (error) {
    next(error);
  }
});

// Exporta o roteador para o app.js.
export default router;