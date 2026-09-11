export function errorHandler(err, req, res, next) {
    console.error(err);

    //erros comuns do mysql traduzidos
    if (err && err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({error: "Já existe um registro com esse valor único (CPF/e-mail)."});
    }
    if (err && err.code === "ECONNREFUSED") {
        return res
        .status(500)
        .json({error: "Não foi possível conectar ao MySQL. Verifique se o servidor está rodando e o .env está correto."});
    }

    res.status(err.status || 500).json({error: err.message || 'Erro interno do servidor.'});
}

export function notFound(req, res) {
    res.status(404).json({error: "Rota não encontrada."});
}