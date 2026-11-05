import React from "react";

import { Field, TextInput } from "./FormControls.jsx";
import { mascaraDocumento } from "../utils/mascaras.js";

// Fase 8: escolha entre pessoa física (CPF) e pessoa jurídica (CNPJ) + campo
// do documento com máscara. Na edição o documento não muda.
export default function DocumentoCliente({ tipo, valor, erro, disabled = false, onChange }) {
  const pj = tipo === "PJ";

  return (
    <>
      <div className="doc-tipo" role="radiogroup" aria-label="Tipo de cliente">
        {[
          ["PF", "Pessoa física"],
          ["PJ", "Pessoa jurídica"],
        ].map(([chave, rotulo]) => (
          <label key={chave} className={`doc-tipo-opcao${tipo === chave ? " is-ativo" : ""}${disabled ? " is-desabilitado" : ""}`}>
            <input
              type="radio"
              name="tipoPessoa"
              value={chave}
              checked={tipo === chave}
              disabled={disabled}
              onChange={() => onChange({ tipoPessoa: chave, cpf: "" })}
            />
            {rotulo}
          </label>
        ))}
      </div>
      <Field label={pj ? "CNPJ" : "CPF"} error={erro}>
        <TextInput
          value={valor}
          onChange={(event) => onChange({ tipoPessoa: tipo, cpf: mascaraDocumento(event.target.value, tipo) })}
          placeholder={pj ? "00.000.000/0000-00" : "000.000.000-00"}
          inputMode="numeric"
          disabled={disabled}
        />
      </Field>
    </>
  );
}
