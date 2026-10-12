export function errorHandler(err, req, res, next) {
    console.error(err);

 // Erros comuns do PostgreSQL traduzidos para melhor ajuda
 // 23505 = unique_violation (ex: CPF ou o em-mail duplicado)

 if (err && err.code ==="23505") {
    return res.status(409).json ({error: "Já existe um registro com esse valor único (CPF/e-mail"});
 }
// 23503 = foreign_key_violation (ex: referenciar um cliente/produto que não existe)
 if (err && err.code ==="23503") {
    return res.status(409).json({error: "Este registro está vinculado a outro que não existe ou não pode ser removido."});
 }
// 23502 = not_null_violation (campo obrigatório não informado)
 if (err && err.code ==="23502") {
    return res.status(400).json({error: `O campo "${err.column || "obrigatório"}" precisa ser informado.`});
 }
 if (err && err.code === "ECONNREFUSED") {
    return res.status(500).json({ error: "Não foi possível conectar ao PostgreSQL. Verifique se o servidor está rodandoe o .env está correto."});
 }
 res.status(err.status || 500).json({error: err.message || 'Erro interno do servidor;'});

}

export function notFound(req, res) {
    res.status(404).json({error: "Rota não encontrada."});
}