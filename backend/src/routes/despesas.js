import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { despesas, veiculos, usuarios } from "../db/schema.js";
import { roles, validId } from "../security.js";
import { CATEGORIAS_DESPESA } from "../relatorios/consultas.js";
import { normalizarVinculos } from "../despesasRegras.js";

// Fase 8 — controle de gastos. Somente o CEO lança e consulta despesas: elas
// alimentam o lucro real nos relatórios.

const router = Router();

router.use(roles("ceo"));

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function validar(body) {
  const descricao = String(body.descricao || "").trim();
  const categoria = String(body.categoria || "");
  const valor = Number(String(body.valor ?? "").replace(",", "."));
  const data = String(body.data || "");
  const observacao = String(body.observacao || "").trim() || null;

  if (!descricao || descricao.length > 150) {
    return { erro: "Informe a descrição (até 150 caracteres)." };
  }
  if (!CATEGORIAS_DESPESA.includes(categoria)) {
    return { erro: "Categoria inválida." };
  }
  if (!Number.isFinite(valor) || valor <= 0 || valor > 99999999.99) {
    return { erro: "Informe um valor maior que zero." };
  }
  const d = new Date(`${data}T00:00:00Z`);
  if (!DATA_ISO.test(data) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== data) {
    return { erro: "Informe uma data válida." };
  }
  if (observacao && observacao.length > 255) {
    return { erro: "A observação deve ter no máximo 255 caracteres." };
  }

  const vinculos = normalizarVinculos(categoria, body);
  if (vinculos.erro) return { erro: vinculos.erro };

  return {
    dados: {
      descricao,
      categoria,
      valor: valor.toFixed(2),
      data,
      observacao,
      veiculoId: vinculos.veiculoId,
      funcionarioId: vinculos.funcionarioId,
    },
  };
}

// Confere se o veículo/funcionário escolhido existe (e o funcionário está ativo).
async function conferirVinculos(dados) {
  if (dados.veiculoId) {
    const [v] = await db.select({ id: veiculos.id }).from(veiculos).where(eq(veiculos.id, dados.veiculoId));
    if (!v) return "Veículo não encontrado.";
  }
  if (dados.funcionarioId) {
    const [u] = await db
      .select({ id: usuarios.id, ativo: usuarios.ativo })
      .from(usuarios)
      .where(eq(usuarios.id, dados.funcionarioId));
    if (!u) return "Funcionário não encontrado.";
  }
  return null;
}

router.get("/", async (_req, res, next) => {
  try {
    const linhas = await db
      .select({
        id: despesas.id,
        descricao: despesas.descricao,
        categoria: despesas.categoria,
        valor: despesas.valor,
        data: despesas.data,
        observacao: despesas.observacao,
        usuarioId: despesas.usuarioId,
        veiculoId: despesas.veiculoId,
        funcionarioId: despesas.funcionarioId,
        veiculoPlaca: veiculos.placa,
        veiculoModelo: veiculos.modelo,
        funcionarioNome: usuarios.nome,
        criadoEm: despesas.criadoEm,
      })
      .from(despesas)
      .leftJoin(veiculos, eq(despesas.veiculoId, veiculos.id))
      .leftJoin(usuarios, eq(despesas.funcionarioId, usuarios.id))
      .orderBy(desc(despesas.data), desc(despesas.id));
    res.json(linhas);
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { erro, dados } = validar(req.body);
    if (erro) return res.status(400).json({ error: erro });
    const erroVinculo = await conferirVinculos(dados);
    if (erroVinculo) return res.status(400).json({ error: erroVinculo });

    const [criada] = await db
      .insert(despesas)
      .values({ ...dados, usuarioId: req.usuario.id })
      .returning();
    res.status(201).json(criada);
  } catch (error) {
    next(error);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!validId(id)) return res.status(400).json({ error: "ID inválido." });

    const { erro, dados } = validar(req.body);
    if (erro) return res.status(400).json({ error: erro });
    const erroVinculo = await conferirVinculos(dados);
    if (erroVinculo) return res.status(400).json({ error: erroVinculo });

    const [atualizada] = await db
      .update(despesas)
      .set(dados)
      .where(eq(despesas.id, id))
      .returning();
    if (!atualizada) return res.status(404).json({ error: "Despesa não encontrada." });
    res.json(atualizada);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!validId(id)) return res.status(400).json({ error: "ID inválido." });

    const [removida] = await db.delete(despesas).where(eq(despesas.id, id)).returning();
    if (!removida) return res.status(404).json({ error: "Despesa não encontrada." });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
