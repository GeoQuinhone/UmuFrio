// Erro com status HTTP. O errorHandler usa `status` para responder ao cliente e
// inclui `dados` (se houver) no corpo da resposta, para o front tratar casos
// como "fora do raio" sem ler a mensagem.
export function erroHttp(mensagem, status, dados) {
  const error = new Error(mensagem);
  error.status = status;
  if (dados) error.dados = dados;
  return error;
}
