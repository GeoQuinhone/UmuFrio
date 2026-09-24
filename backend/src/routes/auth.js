import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, pool } from "../db/client.js";
import { usuarios } from "../db/schema.js";
import {
  hashPassword,
  onlyDigits,
  requireAuth,
  signToken,
  verifyPassword,
} from "../security.js";

const router = Router();

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

router.post("/login", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const senha = String(req.body.senha || "");

    if (!email || !senha) {
      return res.status(400).json({
        error: "Informe e-mail e senha.",
      });
    }

    const [usuario] = await db
      .select()
      .from(usuarios)
      .where(eq(usuarios.email, email));

    if (!usuario || !usuario.ativo) {
      return res.status(401).json({
        error: "E-mail ou senha inválidos.",
      });
    }

    if (
      usuario.bloqueadoAte &&
      new Date(usuario.bloqueadoAte) > new Date()
    ) {
      return res.status(423).json({
        error: "Usuário temporariamente bloqueado.",
      });
    }

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

    await db
      .update(usuarios)
      .set({
        falhasLogin: 0,
        bloqueadoAte: null,
      })
      .where(eq(usuarios.id, usuario.id));

    return res.json({
      token: signToken(usuario),
      usuario: safe(usuario),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/bootstrap", async (req, res, next) => {
  let client;

  try {
    client = await pool.connect();

    await client.query("BEGIN");

    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('umufrio:ceo-bootstrap'))",
    );

    const count = await client.query(
      "SELECT count(*)::int AS total FROM usuarios",
    );

    if (count.rows[0].total !== 0) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        error: "O CEO inicial já foi criado.",
      });
    }

    const nome = String(req.body.nome || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const cpf = onlyDigits(req.body.cpf);
    const telefone = String(req.body.telefone || "").trim();
    const senha = String(req.body.senha || "");

    if (
      !nome ||
      !email ||
      cpf.length !== 11 ||
      !telefone ||
      senha.length < 6
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        error:
          "Informe nome, e-mail, CPF, telefone e senha com no mínimo 6 caracteres.",
      });
    }

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

router.post("/trocar-senha", requireAuth, async (req, res, next) => {
  try {
    const senhaAtual = String(req.body.senhaAtual || "");
    const novaSenha = String(req.body.novaSenha || "");

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

    if (
      !req.usuario.primeiroAcesso &&
      !verifyPassword(senhaAtual, usuario.senhaHash)
    ) {
      return res.status(401).json({
        error: "Informe a senha atual correta.",
      });
    }

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

router.post("/recuperar-senha/validar", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const cpf = onlyDigits(req.body.cpf);

    if (!email || cpf.length !== 11) {
      return res.status(400).json({
        error: "Informe e-mail e CPF.",
      });
    }

    const [usuario] = await db
      .select()
      .from(usuarios)
      .where(eq(usuarios.email, email));

    if (!usuario || onlyDigits(usuario.cpf) !== cpf) {
      return res.status(401).json({
        error: "O CPF informado não corresponde ao cadastrado para este e-mail.",
      });
    }

    return res.json({
      valido: true,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/recuperar-senha/redefinir", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const cpf = onlyDigits(req.body.cpf);
    const novaSenha = String(req.body.novaSenha || "");

    if (!email || cpf.length !== 11) {
      return res.status(400).json({
        error: "Informe e-mail e CPF.",
      });
    }

    if (novaSenha.length < 6) {
      return res.status(400).json({
        error: "A nova senha deve ter no mínimo 6 caracteres.",
      });
    }

    const [usuario] = await db
      .select()
      .from(usuarios)
      .where(eq(usuarios.email, email));

    if (!usuario || onlyDigits(usuario.cpf) !== cpf) {
      return res.status(401).json({
        error: "O CPF informado não corresponde ao cadastrado para este e-mail.",
      });
    }

    await db
      .update(usuarios)
      .set({
        senhaHash: hashPassword(novaSenha),
        primeiroAcesso: 0,
        falhasLogin: 0,
        bloqueadoAte: null,
      })
      .where(eq(usuarios.id, usuario.id));

    return res.json({
      sucesso: true,
    });
  } catch (error) {
    next(error);
  }
});

export default router;