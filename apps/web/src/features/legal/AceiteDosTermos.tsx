"use client";

/**
 * A caixa obrigatória dos cadastros (LGPD, card #79): "Li e aceito os Termos
 * de Uso e a Política de Privacidade", com os dois links abrindo em nova aba
 * para a pessoa ler sem perder o que já digitou. `tipo="lojista"` é a caixa
 * dos Termos do Lojista, de quem abre loja.
 */
import "@simpleclick/ui/styles/aceite.css";

import {
  CAMINHO_DOS_DOCUMENTOS_LEGAIS,
  ROTULO_DOS_DOCUMENTOS_LEGAIS,
  type DocumentoLegal,
} from "@simpleclick/contracts";

export function LinkDoDocumento({
  documento,
}: {
  readonly documento: DocumentoLegal;
}) {
  return (
    <a
      className="sc-aceite__link"
      href={CAMINHO_DOS_DOCUMENTOS_LEGAIS[documento]}
      target="_blank"
      rel="noopener noreferrer"
    >
      {ROTULO_DOS_DOCUMENTOS_LEGAIS[documento]}
      <span className="sc-so-leitor"> (abre em nova aba)</span>
    </a>
  );
}

export interface AceiteDosTermosProps {
  /** Prefixo do `id` (a janela da loja e a página usam o seu). */
  readonly id: string;
  readonly marcado: boolean;
  readonly aoMudar: (marcado: boolean) => void;
  readonly erro?: string | undefined;
  readonly desabilitado?: boolean | undefined;
  /** `conta` = Termos de Uso e Política; `lojista` = Termos do Lojista. */
  readonly tipo?: "conta" | "lojista";
}

export function AceiteDosTermos({
  id,
  marcado,
  aoMudar,
  erro,
  desabilitado,
  tipo = "conta",
}: AceiteDosTermosProps) {
  const idDoErro = `${id}-erro`;
  return (
    <div className="sc-aceite">
      <label className="sc-aceite__rotulo" htmlFor={id}>
        <input
          id={id}
          name={tipo === "conta" ? "aceitouTermos" : "aceitouTermosDoLojista"}
          className="sc-aceite__caixa"
          type="checkbox"
          checked={marcado}
          disabled={desabilitado}
          aria-invalid={erro !== undefined || undefined}
          aria-describedby={erro === undefined ? undefined : idDoErro}
          onChange={(evento) => aoMudar(evento.target.checked)}
        />
        <span>
          {tipo === "conta" ? (
            <>
              Li e aceito os <LinkDoDocumento documento="TERMS_OF_USE" /> e a{" "}
              <LinkDoDocumento documento="PRIVACY_POLICY" />.
            </>
          ) : (
            <>
              Li e aceito os <LinkDoDocumento documento="MERCHANT_TERMS" />.
            </>
          )}
        </span>
      </label>
      {erro === undefined ? null : (
        <p className="sc-aceite__erro" id={idDoErro} role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}
