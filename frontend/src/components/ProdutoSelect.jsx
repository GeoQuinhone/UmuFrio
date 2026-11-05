import React, { useEffect, useMemo, useRef, useState } from "react";

import { minimoDoProduto, moedaProduto, situacaoEstoque } from "../utils/estoque.js";

// Fase 8 — seletor de produto com busca, usado na movimentação de estoque, nas
// peças do serviço e na peça extra do atendimento. Cada opção mostra nome,
// saldo, estoque mínimo (quando permitido) e valor, e avisa quando o produto
// está zerado ou no mínimo.
export default function ProdutoSelect({
  produtos = [],
  value,
  onChange,
  placeholder = "Buscar produto...",
  mostrarMinimo = true,
  mostrarValor = true,
  exigirSaldo = false,
  id,
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [destaque, setDestaque] = useState(0);
  const raiz = useRef(null);

  const selecionado = produtos.find((p) => String(p.id) === String(value));

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    const base = termo
      ? produtos.filter((p) => String(p.nome).toLocaleLowerCase("pt-BR").includes(termo))
      : produtos;
    return base;
  }, [produtos, busca]);

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (evento) => {
      if (raiz.current && !raiz.current.contains(evento.target)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  function escolher(produto) {
    if (exigirSaldo && Number(produto.saldo) <= 0) return;
    onChange(String(produto.id));
    setAberto(false);
    setBusca("");
  }

  function teclas(evento) {
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      setAberto(true);
      setDestaque((i) => Math.min(i + 1, filtrados.length - 1));
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      setDestaque((i) => Math.max(i - 1, 0));
    } else if (evento.key === "Enter" && aberto && filtrados[destaque]) {
      evento.preventDefault();
      escolher(filtrados[destaque]);
    } else if (evento.key === "Escape") {
      setAberto(false);
    }
  }

  function meta(produto) {
    const partes = [`Saldo ${produto.saldo ?? 0}`];
    if (mostrarMinimo && produto.quantidadeMinima !== undefined) partes.push(`Mín. ${minimoDoProduto(produto)}`);
    if (mostrarValor && produto.valorUnitario !== undefined) partes.push(moedaProduto(produto.valorUnitario));
    return partes.join(" · ");
  }

  return (
    <div className="produto-select" ref={raiz}>
      <input
        id={id}
        className="input produto-select-input"
        type="text"
        role="combobox"
        aria-expanded={aberto}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={selecionado ? `${selecionado.nome} — ${meta(selecionado)}` : placeholder}
        value={aberto ? busca : selecionado ? selecionado.nome : ""}
        onFocus={() => setAberto(true)}
        onChange={(evento) => {
          setBusca(evento.target.value);
          setAberto(true);
          setDestaque(0);
        }}
        onKeyDown={teclas}
      />
      {selecionado && !aberto && <small className="produto-select-resumo">{meta(selecionado)}</small>}

      {aberto && (
        <ul className="produto-select-lista" role="listbox">
          {filtrados.length === 0 && <li className="produto-select-vazio">Nenhum produto encontrado.</li>}
          {filtrados.map((produto, indice) => {
            const situacao = situacaoEstoque(produto);
            const bloqueado = exigirSaldo && situacao === "zerado";
            return (
              <li
                key={produto.id}
                role="option"
                aria-selected={String(produto.id) === String(value)}
                aria-disabled={bloqueado}
                className={`produto-select-opcao${indice === destaque ? " is-destaque" : ""}${bloqueado ? " is-bloqueado" : ""}`}
                onMouseDown={(evento) => {
                  evento.preventDefault();
                  escolher(produto);
                }}
                onMouseEnter={() => setDestaque(indice)}
              >
                <span className="produto-select-nome">{produto.nome}</span>
                <span className="produto-select-meta">{meta(produto)}</span>
                {situacao !== "ok" && (
                  <span className={`produto-select-tag tag-${situacao}`}>
                    {situacao === "zerado" ? "Zerado" : "No mínimo"}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
