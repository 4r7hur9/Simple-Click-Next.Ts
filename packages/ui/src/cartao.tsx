import type { ReactNode } from "react";
import { Carregando, Erro, Esqueleto, Sucesso, Vazio } from "./estados";
import type { EstadoDaTela } from "./estados";

/**
 * Cartão: a moldura padrão de um bloco de conteúdo.
 *
 * O cartão é onde os quatro estados aparecem inteiros, porque ele é a menor
 * unidade de tela que carrega dado próprio — o resumo do dia, o endereço de
 * entrega, o último pedido. Quando o dado dele não chegou, o cartão mostra a
 * espera **na própria moldura**, e não some da tela: bloco que aparece do nada
 * empurra o resto e faz o dono clicar no lugar errado.
 */

/** Nível do título dentro da hierarquia da página. */
export type NivelDeTitulo = 2 | 3 | 4 | 5 | 6;

export type CartaoProps = {
  titulo?: string | undefined;
  nivelDoTitulo?: NivelDeTitulo | undefined;
  estado?: EstadoDaTela | undefined;
  /** Texto mostrado quando o estado é `vazio`. */
  tituloVazio?: string | undefined;
  descricaoVazio?: string | undefined;
  /** Texto mostrado quando o estado é `erro`. */
  mensagemDeErro?: string | undefined;
  referenciaDoErro?: string | undefined;
  /** Texto mostrado quando o estado é `sucesso`. */
  tituloDeSucesso?: string | undefined;
  descricaoDeSucesso?: string | undefined;
  rotuloDeEspera?: string | undefined;
  /** Desenha a espera com a forma do conteúdo, em vez de uma linha de texto. */
  esperaComEsqueleto?: boolean | undefined;
  rodape?: ReactNode | undefined;
  children?: ReactNode | undefined;
  className?: string | undefined;
};

/** A moldura com o estado da tela dentro dela, ou o conteúdo quando pronto. */
export function Cartao({
  titulo,
  nivelDoTitulo = 3,
  estado = "pronto",
  tituloVazio = "Nada por aqui ainda",
  descricaoVazio,
  mensagemDeErro = "Não foi possível carregar este bloco. Tente de novo em instantes.",
  referenciaDoErro,
  tituloDeSucesso = "Tudo certo",
  descricaoDeSucesso,
  rotuloDeEspera = "Carregando…",
  esperaComEsqueleto = false,
  rodape,
  children,
  className,
}: CartaoProps) {
  const Titulo = `h${nivelDoTitulo}` as const;

  return (
    <section
      className={["sc-cartao", className].filter(Boolean).join(" ")}
      aria-busy={estado === "carregando" || undefined}
    >
      {titulo !== undefined && (
        <Titulo className="sc-cartao__titulo">{titulo}</Titulo>
      )}

      {estado === "carregando" &&
        (esperaComEsqueleto ? (
          <Esqueleto rotulo={rotuloDeEspera} />
        ) : (
          <Carregando rotulo={rotuloDeEspera} />
        ))}

      {estado === "vazio" && (
        <Vazio descricao={descricaoVazio} titulo={tituloVazio} />
      )}

      {estado === "erro" && (
        <Erro mensagem={mensagemDeErro} referencia={referenciaDoErro} />
      )}

      {estado === "sucesso" && (
        <Sucesso descricao={descricaoDeSucesso} titulo={tituloDeSucesso} />
      )}

      {estado === "pronto" && children}

      {rodape !== undefined && (
        <div className="sc-cartao__rodape">{rodape}</div>
      )}
    </section>
  );
}
