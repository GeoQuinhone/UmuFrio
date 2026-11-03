import { Router } from "express";
import { and, eq, ne } from "drizzle-orm";
import { db } from "../db/client.js";
import { veiculos, usuarios } from "../db/schema.js";
import { roles, validId } from "../security.js";

const router = Router();

const STATUS = ["ativo", "manutencao", "inativo"];

// Placa no padrão antigo (ABC1234) ou Mercosul (ABC1D23), sem traço.
function normalizarPlaca(valor) {
  return String(valor || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function placaValida(placa) {
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa);
}

function validarVeiculo(body) {
  const anoMaximo = new Date().getFullYear() + 1;
  const ano = Number(body.ano);

  if (!placaValida(normalizarPlaca(body.placa))) {
    return "Informe uma placa válida (ex.: ABC1234 ou ABC1D23).";
  }

  if (!body.marca?.trim() || !body.modelo?.trim()) {
    return "Preencha a marca e o modelo do veículo.";
  }

  if (!Number.isInteger(ano) || ano < 1980 || ano > anoMaximo) {
    return `Informe um ano entre 1980 e ${anoMaximo}.`;
  }

  if (body.tecnicoId && !validId(body.tecnicoId)) {
    return "Técnico inválido.";
  }

  if (body.status !== undefined && !STATUS.includes(body.status)) {
    return "Situação inválida.";
  }

  return null;
}

// Confere as regras que dependem do banco: placa única, técnico ativo com
// perfil técnico e no máximo um veículo por técnico.
async function conferirVinculos({ placa, tecnicoId }, idAtual) {
  const [mesmaPlaca] = await db
    .select({ id: veiculos.id })
    .from(veiculos)
    .where(
      and(
        eq(veiculos.placa, placa),
        idAtual ? ne(veiculos.id, idAtual) : undefined,
      ),
    );

  if (mesmaPlaca) {
    return "Já existe um veículo cadastrado com esta placa.";
  }

  if (!tecnicoId) return null;

  const [tecnico] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(
      and(
        eq(usuarios.id, tecnicoId),
        eq(usuarios.perfil, "tecnico"),
        eq(usuarios.ativo, 1),
      ),
    );

  if (!tecnico) {
    return "Selecione um técnico ativo.";
  }

  const [outroVeiculo] = await db
    .select({ placa: veiculos.placa })
    .from(veiculos)
    .where(
      and(
        eq(veiculos.tecnicoId, tecnicoId),
        idAtual ? ne(veiculos.id, idAtual) : undefined,
      ),
    );

  if (outroVeiculo) {
    return `Este técnico já é responsável pelo veículo ${outroVeiculo.placa}.`;
  }

  return null;
}

// Situação do veículo: ativo, em manutenção ou inativo. Só o veículo ativo
// aparece no atendimento do técnico. Sem situação no corpo, mantém a atual.
function dadosDoBody(body) {
  return {
    placa: normalizarPlaca(body.placa),
    marca: body.marca.trim(),
    modelo: body.modelo.trim(),
    ano: Number(body.ano),
    tecnicoId: body.tecnicoId ? Number(body.tecnicoId) : null,
    ...(body.status ? { status: body.status } : {}),
  };
}

router.get(
  "/",
  roles("ceo"),
  async (_req, res, next) => {
    try {
      const rows = await db
        .select({
          id: veiculos.id,
          placa: veiculos.placa,
          marca: veiculos.marca,
          modelo: veiculos.modelo,
          ano: veiculos.ano,
          tecnicoId: veiculos.tecnicoId,
          tecnicoNome: usuarios.nome,
          status: veiculos.status,
          criadoEm: veiculos.criadoEm,
        })
        .from(veiculos)
        .leftJoin(usuarios, eq(veiculos.tecnicoId, usuarios.id))
        .orderBy(veiculos.modelo, veiculos.placa);

      res.json(rows);
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
      const error = validarVeiculo(req.body);

      if (error) {
        return res.status(400).json({ error });
      }

      const dados = dadosDoBody(req.body);
      const conflito = await conferirVinculos(dados);

      if (conflito) {
        return res.status(409).json({ error: conflito });
      }

      const [veiculo] = await db
        .insert(veiculos)
        .values({ ...dados, status: dados.status || "ativo" })
        .returning();

      res.status(201).json(veiculo);
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

      const [veiculo] = await db
        .select()
        .from(veiculos)
        .where(eq(veiculos.id, id));

      if (!veiculo) {
        return res.status(404).json({
          error: "Veículo não encontrado.",
        });
      }

      const error = validarVeiculo(req.body);

      if (error) {
        return res.status(400).json({ error });
      }

      const dados = dadosDoBody(req.body);
      const conflito = await conferirVinculos(dados, id);

      if (conflito) {
        return res.status(409).json({ error: conflito });
      }

      const [atualizado] = await db
        .update(veiculos)
        .set(dados)
        .where(eq(veiculos.id, id))
        .returning();

      res.json(atualizado);
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
        .delete(veiculos)
        .where(eq(veiculos.id, id));

      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);

export default router;