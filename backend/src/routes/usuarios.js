import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { usuarios } from "../db/schema.js";

const router = Router();

const PERFIS = ["ceo", "atendente", "estoquista", "tecnico"];

// get 
router.get("/", async (req, res, next) => {
  try {
    const rows = await db.select().from(usuarios).orderBy(usuarios.nome);
    // nunca devolver a senha para o front
    res.json(rows.map(({ senhaHash, ...u }) => u));
  } catch (err) {
    next(err);
  }
});

// POST  (RN-01: e-mail único, RN-02: senha mínima 6 caracteres)
router.post("/", async (req, res, next) => {
  try {
    const { nome, email, telefone, perfil, senha } = req.body;
    if (!nome?.trim() || !email?.trim() || !telefone?.trim()) {
      return res.status(400).json({ error: "Preencha todos os campos obrigatórios." });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: "E-mail inválido." });
    }
    if (!perfil || !PERFIS.includes(perfil)) {
      return res.status(400).json({ error: "Perfil inválido." });
    }
    if (!senha || senha.length < 6) {
      return res.status(400).json({ error: "A senha deve ter no mínimo 6 caracteres." });
    }

    const existentes = await db.select().from(usuarios).where(eq(usuarios.email, email.trim().toLowerCase()));
    if (existentes.length > 0) {
      return res.status(409).json({ error: "Já existe um usuário com este e-mail." });
    }

    // Este protótipo grava a senha como texto puro só para fins de demonstração.
    const [result] = await db
      .insert(usuarios)
      .values({ nome, email: email.trim().toLowerCase(), telefone, perfil, senhaHash: senha });
    const [created] = await db.select().from(usuarios).where(eq(usuarios.id, result.insertId));
    const { senhaHash, ...safe } = created;
    res.status(201).json(safe);
  } catch (err) {
    next(err);
  }
});

// PUT   edita nome o telefone e perfil; e-mail não pode ser alterado
router.put("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [current] = await db.select().from(usuarios).where(eq(usuarios.id, id));
    if (!current) return res.status(404).json({ error: "Usuário não encontrado." });

    const { nome, telefone, perfil, senha } = req.body;
    if (!nome?.trim() || !telefone?.trim()) {
      return res.status(400).json({ error: "Preencha todos os campos obrigatórios." });
    }
    if (!perfil || !PERFIS.includes(perfil)) {
      return res.status(400).json({ error: "Perfil inválido." });
    }

    const patch = { nome, telefone, perfil };
    if (senha) {
      if (senha.length < 6) {
        return res.status(400).json({ error: "A senha deve ter no mínimo 6 caracteres." });
      }
      patch.senhaHash = senha;
    }

    await db.update(usuarios).set(patch).where(eq(usuarios.id, id));
    const [updated] = await db.select().from(usuarios).where(eq(usuarios.id, id));
    const { senhaHash, ...safe } = updated;
    res.json(safe);
  } catch (err) {
    next(err);
  }
});

// DELETE 
router.delete("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await db.delete(usuarios).where(eq(usuarios.id, id));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;