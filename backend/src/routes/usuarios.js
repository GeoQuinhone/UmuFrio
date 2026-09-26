import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { usuarios } from "../db/schema.js";
import {
  hashPassword,
  onlyDigits,
  roles,
  validId,
} from "../security.js";

const router = Router();

const PERFIS = [
  "ceo",
  "atendente",
  "estoquista",
  "tecnico",
];

function usuarioSeguro(usuario) {
  const { senhaHash, ...dados } = usuario;
  return dados;
}

router.get(
  "/",
  roles("ceo"),
  async (_req, res, next) => {
    try {
      const rows = await db
        .select()
        .from(usuarios)
        .orderBy(usuarios.nome);

      res.json(rows.map(usuarioSeguro));
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/",
  roles("ceo"),
  async (req, res, next) => {
    try {
      const {
        nome,
        email,
        cpf,
        telefone,
        perfil,
        senha,
      } = req.body;

      if (
        !nome?.trim() ||
        !email?.trim() ||
        !telefone?.trim() ||
        !senha ||
        !PERFIS.includes(perfil)
      ) {
        return res.status(400).json({
          error: "Preencha corretamente os dados do usuário.",
        });
      }

      if (onlyDigits(cpf).length !== 11) {
        return res.status(400).json({
          error: "CPF deve possuir 11 dígitos.",
        });
      }

      if (senha.length < 6) {
        return res.status(400).json({
          error: "A senha deve possuir no mínimo 6 caracteres.",
        });
      }

      const emailNormalizado = email.trim().toLowerCase();

      const usuarioExistente = await db
        .select()
        .from(usuarios)
        .where(eq(usuarios.email, emailNormalizado));

      if (usuarioExistente.length > 0) {
        return res.status(409).json({
          error: "Já existe um usuário com este e-mail.",
        });
      }

      const [usuario] = await db
        .insert(usuarios)
        .values({
          nome: nome.trim(),
          email: emailNormalizado,
          cpf: onlyDigits(cpf),
          telefone: telefone.trim(),
          perfil,
          senhaHash: hashPassword(senha),
          primeiroAcesso: 1,
          ativo: 1,
        })
        .returning();

      res.status(201).json(usuarioSeguro(usuario));
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  "/:id",
  roles("ceo"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);

      if (!validId(id)) {
        return res.status(400).json({
          error: "ID inválido.",
        });
      }

      const usuarioAtual = await db
        .select()
        .from(usuarios)
        .where(eq(usuarios.id, id));

      if (!usuarioAtual[0]) {
        return res.status(404).json({
          error: "Usuário não encontrado.",
        });
      }

      const {
        nome,
        telefone,
        perfil,
        senha,
      } = req.body;

      if (
        !nome?.trim() ||
        !telefone?.trim() ||
        !PERFIS.includes(perfil)
      ) {
        return res.status(400).json({
          error: "Preencha corretamente os dados do usuário.",
        });
      }

      if (senha && senha.length < 6) {
        return res.status(400).json({
          error: "A senha deve possuir no mínimo 6 caracteres.",
        });
      }

      const dados = {
        nome: nome.trim(),
        telefone: telefone.trim(),
        perfil,
      };

      if (senha) {
        dados.senhaHash = hashPassword(senha);
        dados.primeiroAcesso = 1;
      }

      const [usuario] = await db
        .update(usuarios)
        .set(dados)
        .where(eq(usuarios.id, id))
        .returning();

      res.json(usuarioSeguro(usuario));
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/:id/status",
  roles("ceo"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);

      if (!validId(id)) {
        return res.status(400).json({
          error: "ID inválido.",
        });
      }

      const usuarioAtual = await db
        .select()
        .from(usuarios)
        .where(eq(usuarios.id, id));

      const usuario = usuarioAtual[0];

      if (!usuario) {
        return res.status(404).json({
          error: "Usuário não encontrado.",
        });
      }

      const [atualizado] = await db
        .update(usuarios)
        .set({
          ativo: usuario.ativo ? 0 : 1,
        })
        .where(eq(usuarios.id, id))
        .returning();

      res.json(usuarioSeguro(atualizado));
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  "/:id",
  roles("ceo"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);

      if (!validId(id)) {
        return res.status(400).json({
          error: "ID inválido.",
        });
      }

      await db
        .update(usuarios)
        .set({ ativo: 0 })
        .where(eq(usuarios.id, id));

      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);

export default router;