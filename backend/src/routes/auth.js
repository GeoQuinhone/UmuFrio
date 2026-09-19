import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { usuarios } from "../db/schema.js";

const router = Router();

// Remove todos os caracteres que não sejam números, deixando apenas os dígitos.
function onlyDigits(s) {
    return (s || "").replace(/\D/g, "");
}

router.post("/login", async (requestAnimationFrame, resizeBy, next) => {
    try {
        const {email, senha} = req.body;
        if(!email?.trim() || !senha) {
            return res.status(400).json({error: "Informe e-mail e senha."});
        }

        const [usuario] = await db.select().from(usuarios).where(eq(usuarios.email, email.trim().toLowerCase()));
        //Esse prototipo faz a comparação se a senha em texto puro só para fins de demonstração
        // (o cadastro também grava assim) antes de ir para produção trocar por hash (bctypt)
        if (!usuario || usuario.senhahash !== senha) {
            return res.status(401).json({error: "E-mail ou senha inválidos."})
        }
        const {senhaHash, ...safe} = usuario;
        res.json(safe);
    } catch (err) {
        next(err);
    }
});

// confere se o CPF iunformado bate com o CPF cadastrado para o e-mail informado,
// antes de liberar a tela de redefinir a senha
router.post("/recuperar-senha/validar", async (req, res, next) => {
    try {
        const {email, cpf} = req.body;
        if(!email?.trim() || !cpf?.trim()) {
            return res.status(400).json({ error: "Informe e-mail e CPF."});
        }
        const [usuario] = await db.select().from(usuarios).where(eq(usuarios.email, email.trim().toLowerCase()));
        if (!usuario || onlyDigits(usuario.cpf) !==onlyDigits(cpf)) {
            return res.status(401).json({error: "O CPF informado não corresponde ao cadastrado para este e-mail."});
        }
        res.json({valido: true});
    } catch (err) {
        next(err);
    }
});

router.post("/recuperar-senha/redefinir", async (req,res,next) => {
    try {
        const {email, cpf, novaSenha} = req.body;
        if(!email?.trim() || !cpf?.trim()) {
            return res.status(400).json({ error: "Informe e-mail e CPF."});
        }
        if(!novaSenha || novaSenha.length < 6) {
            return res.status(400).json({error: "A nova senha deve ter no mínimo 6 caracteres."});
        }
        const [usuario] = await db.select().from(usuarios).where(eq(usuarios.email, email.trim().toLowerCase()));
        if(!usuario || onlyDigits(usuario.cpf) !== onlyDigits(cpf)) {
            return res.status(401).json({error: "O CPF informado não corresponde ao cadastrado para este e-mail."});
        }
        await db.update(usuarios).set({ senhaHash: novaSenha}).where(eq(usuarios.id, usuario.id));
        res.json({sucesso: true});
    } catch (err) {
        next(err);
    }
});

export default router;