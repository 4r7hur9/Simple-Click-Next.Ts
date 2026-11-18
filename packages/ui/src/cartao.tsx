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

/**
 * `padrao` é a moldura de bloco do painel. `vitrine` é a superfície das telas
 * do cliente (card #104): mais escura que o fundo dos controles, sem sombra, e
 * sem papel interativo: se o cartão inteiro é link, só UM elemento é focável.
 */
export type SuperficieDoCartao = "padrao" | "vitrine";

export type CartaoProps = {
  superficie?: SuperficieDoCartao | undefined;
  titulo?: string | undefined;
  nivelDoTitulo?: NivelDeTitulo | undefined;
  /** Linha curta abaixo do título, em tinta suave. */
  descricao?: ReactNode | undefined;
  /** Marca, avatar ou ícone à esquerda do título. */
  icone?: ReactNode | undefined;
  /** Ações curtas no canto do cabeçalho (botões só-ícone, um `Selo`). */
  acoes?: ReactNode | undefined;
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
  superficie = "padrao",
  titulo,
  nivelDoTitulo = 3,
  descricao,
  icone,
  acoes,
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
  const temCabecalho =
    titulo !== undefined ||
    descricao !== undefined ||
    icone !== undefined ||
    acoes !== undefined;

  return (
    <section
      className={[
        "sc-cartao",
        superficie === "vitrine" && "sc-cartao--vitrine",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-busy={estado === "carregando" || undefined}
    >
      {temCabecalho && (
        <div className="sc-cartao__cabecalho">
          {icone !== undefined && (
            <div className="sc-cartao__icone">{icone}</div>
          )}
          <div className="sc-cartao__cabeca">
            {titulo !== undefined && (
              <Titulo className="sc-cartao__titulo">{titulo}</Titulo>
            )}
            {descricao !== undefined && (
              <p className="sc-cartao__descricao">{descricao}</p>
            )}
          </div>
          {acoes !== undefined && (
            <div className="sc-cartao__acoes">{acoes}</div>
          )}
        </div>
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
