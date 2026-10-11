import type { InputHTMLAttributes, ReactNode } from "react";
import { Girando } from "./estados";

/**
 * Campo de formulário com rótulo, dica e retorno.
 *
 * Estados que fazem sentido aqui: **carregando** (validando no servidor, por
 * exemplo o apelido da loja que precisa ser único), **erro** (o que foi
 * digitado não serve) e **sucesso** (serve). Vazio não é estado de campo: campo
 * sem valor é o começo normal da vida dele.
 *
 * A ligação rótulo → controle é feita por `id`, e não por aninhamento, porque
 * é o que funciona igual em todo leitor de tela. A mensagem de erro entra em
 * `aria-describedby` **e** em `role="alert"`: a primeira faz o leitor ler o erro
 * ao chegar no campo, a segunda faz ele avisar na hora em que o erro aparece.
 */

export type CampoProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "className" | "disabled"
> & {
  /** Obrigatório: sem identificador não há como ligar rótulo e mensagens. */
  id: string;
  rotulo: string;
  dica?: string | undefined;
  /** Mensagem de recusa. Presente significa campo inválido. */
  erro?: string | undefined;
  /** Confirmação curta de que o valor serve. */
  sucesso?: string | undefined;
  /** Verificação em andamento contra o servidor. */
  carregando?: boolean | undefined;
  rotuloDeEspera?: string | undefined;
  obrigatorio?: boolean | undefined;
  desabilitado?: boolean | undefined;
  className?: string | undefined;
  /** Permite trocar `input` por `textarea` ou `select` sem perder a moldura. */
  controle?: ReactNode | undefined;
};

/** Rótulo, controle e mensagens de dica, espera, erro e sucesso, por `id`. */
export function Campo({
  id,
  rotulo,
  dica,
  erro,
  sucesso,
  carregando = false,
  rotuloDeEspera = "Verificando…",
  obrigatorio = false,
  desabilitado = false,
  className,
  controle,
  ...resto
}: CampoProps) {
  const idDica = `${id}-dica`;
  const idErro = `${id}-erro`;
  const idSucesso = `${id}-sucesso`;
  const idEspera = `${id}-espera`;

  const descritores = [
    dica !== undefined && idDica,
    erro !== undefined && idErro,
    erro === undefined && sucesso !== undefined && idSucesso,
    carregando && idEspera,
  ].filter((valor): valor is string => typeof valor === "string");

  return (
    <div
      className={[
        "sc-campo",
        erro === undefined && sucesso !== undefined && "sc-campo--sucesso",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <label className="sc-campo__rotulo" htmlFor={id}>
        {rotulo}
        {obrigatorio && (
          <span aria-hidden="true" className="sc-campo__obrigatorio">
            *
          </span>
        )}
      </label>

      {controle ?? (
        <input
          {...resto}
          id={id}
          className="sc-campo__controle"
          disabled={desabilitado}
          required={obrigatorio || undefined}
          aria-invalid={erro !== undefined || undefined}
          aria-describedby={
            descritores.length > 0 ? descritores.join(" ") : undefined
          }
        />
      )}

      {dica !== undefined && (
        <p className="sc-campo__dica" id={idDica}>
          {dica}
        </p>
      )}

      {carregando && (
        <p className="sc-campo__dica" id={idEspera} role="status">
          <Girando /> {rotuloDeEspera}
        </p>
      )}

      {erro !== undefined && (
        <p className="sc-campo__erro" id={idErro} role="alert">
          {erro}
        </p>
      )}

      {erro === undefined && sucesso !== undefined && (
        <p className="sc-campo__sucesso" id={idSucesso} role="status">
          {sucesso}
        </p>
      )}
    </div>
  );
}
