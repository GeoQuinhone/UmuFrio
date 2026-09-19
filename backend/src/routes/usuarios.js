import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { usuarios } from "../db/schema.js";

const router = Router();

const PERFIS = ["ceo", "atendente", "estoquista", "tecnico"];

function onlyDigits(s) {
  return (s || "").replace(/\D/g, "");
}

router.get("/", async (req, res, next) => {
  try {
    const rows = await db.select().from(usuarios).orderBy(usuarios.nome);
    // nunca devolver a senha para o front
    res.json(rows.map(({ senhaHash, ...u }) => u));
  } catch (err) {
    next(err);
  }
});

// (RN-01: e-mail único, RN-02: senha mínima 6 caracteres, CPF obrigatório e único — usado na recuperação de senha)
router.post("/", async (req, res, next) => {
  try {
    const { nome, email, cpf, telefone, perfil, senha } = req.body;
    if (!nome?.trim() || !email?.trim() || !cpf?.trim() || !telefone?.trim()) {
      return res.status(400).json({ error: "Preencha todos os campos obrigatórios." });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: "E-mail inválido." });
    }
    if (onlyDigits(cpf).length !== 11) {
      return res.status(400).json({ error: "CPF deve ter 11 dígitos (somente números)." });
    }
    if (!perfil || !PERFIS.includes(perfil)) {
      return res.status(400).json({ error: "Perfil inválido." });
    }
    if (!senha || senha.length < 6) {
      return res.status(400).json({ error: "A senha deve ter no mínimo 6 caracteres." });
    }

    const existentesEmail = await db.select().from(usuarios).where(eq(usuarios.email, email.trim().toLowerCase()));
    if (existentesEmail.length > 0) {
      return res.status(409).json({ error: "Já existe um usuário com este e-mail." });
    }

    const existentesCpf = await db.select().from(usuarios);
    const cpfDuplicado = existentesCpf.some((u) => onlyDigits(u.cpf) === onlyDigits(cpf));
    if (cpfDuplicado) {
      return res.status(409).json({ error: "Já existe um usuário cadastrado com este CPF." });
    }

    // Este protótipo grava a senha como texto puro só para fins de demonstração.
    const [created] = await db
      .insert(usuarios)
      .values({
        nome,
        email: email.trim().toLowerCase(),
        cpf: onlyDigits(cpf),
        telefone,
        perfil,
        senhaHash: senha,
      })
      .returning();
    const { senhaHash, ...safe } = created;
    res.status(201).json(safe);
  } catch (err) {
    next(err);
  }
});

//  (edita nome, telefone e perfil; e-mail e CPF não podem ser alterados)
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

    const [updated] = await db.update(usuarios).set(patch).where(eq(usuarios.id, id)).returning();
    const { senhaHash, ...safe } = updated;
    res.json(safe);
  } catch (err) {
    next(err);
  }
});

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
