import type { InputHTMLAttributes, ReactNode } from "react";
import { descritoresDoCampo } from "./campo-descritores";
import { Girando } from "./estados";
import { IconeBuscar } from "./icones";
import { Info, type ConteudoDoInfo } from "./info";

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
 *
 * `dica` é o texto curto que precisa estar SEMPRE à vista, embaixo do campo.
 * `info` é a explicação mais longa, que fica atrás do botão "i" na linha do
 * rótulo (veja a regra "Campos explicados" em `apps/web/AGENTS.md`); o texto
 * dela também entra no `aria-describedby` do controle.
 */

export type CampoProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "className" | "disabled"
> & {
  /** Obrigatório: sem identificador não há como ligar rótulo e mensagens. */
  id: string;
  rotulo: string;
  dica?: string | undefined;
  /** Explicação atrás do "i" ao lado do rótulo: o que é, quando usar, exemplo. */
  info?: ConteudoDoInfo | undefined;
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
  /**
   * Campo de busca das telas do cliente (card #104): `type="search"`, ícone de
   * lupa, pílula e alvo de toque de 48px. O rótulo continua existindo.
   */
  busca?: boolean | undefined;
  /**
   * Esconde o rótulo da vista, e só da vista: o leitor de tela continua o
   * ouvindo. É o caso da busca, que já tem lupa e texto de exemplo.
   */
  rotuloOculto?: boolean | undefined;
};

/** Rótulo, controle e mensagens de dica, espera, erro e sucesso, por `id`. */
export function Campo({
  id,
  rotulo,
  dica,
  info,
  erro,
  sucesso,
  carregando = false,
  rotuloDeEspera = "Verificando…",
  obrigatorio = false,
  desabilitado = false,
  className,
  controle,
  busca = false,
  rotuloOculto = false,
  ...resto
}: CampoProps) {
  const idDica = `${id}-dica`;
  const idErro = `${id}-erro`;
  const idSucesso = `${id}-sucesso`;
  const idEspera = `${id}-espera`;

  const descritores = descritoresDoCampo(id, {
    info: info !== undefined,
    dica,
    erro,
    sucesso,
    carregando,
  });

  const rotuloDoCampo = (
    <label
      className={["sc-campo__rotulo", rotuloOculto && "sc-so-leitor"]
        .filter(Boolean)
        .join(" ")}
      htmlFor={id}
    >
      {rotulo}
      {obrigatorio && (
        <span aria-hidden="true" className="sc-campo__obrigatorio">
          *
        </span>
      )}
    </label>
  );

  const entrada = (
    <input
      type={busca ? "search" : undefined}
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
  );

  return (
    <div
      className={[
        "sc-campo",
        erro === undefined && sucesso !== undefined && "sc-campo--sucesso",
        busca && "sc-campo--busca",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {info === undefined ? (
        rotuloDoCampo
      ) : (
        // O "i" fica FORA do `<label>`: dentro, o nome do botão entraria no
        // nome do controle.
        <div className="sc-campo__cabeca">
          {rotuloDoCampo}
          <Info id={id} rotulo={rotulo} conteudo={info} />
        </div>
      )}

      {controle ??
        (busca ? (
          <div className="sc-campo__busca">
            <IconeBuscar className="sc-campo__busca-icone" />
            {entrada}
          </div>
        ) : (
          entrada
        ))}

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
