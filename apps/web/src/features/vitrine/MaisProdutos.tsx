"use client";
/**
 * O "Ver mais" de uma lista do cardápio (card #74).
 *
 * O SERVIDOR DESENHA A PRIMEIRA PÁGINA; este componente só ACRESCENTA. Os
 * cartões que vieram do servidor chegam como `children` e ficam como estão;
 * as páginas seguintes são pedidas à ação de servidor da rota e desenhadas
 * aqui com o MESMO cartão.
 *
 * SEM SCRIPT, É UM LINK: numa seção, leva à categoria inteira; na lista única,
 * à página seguinte (`?cursor=`). Ninguém fica preso à primeira página.
 *
 * Com `automatico`, a página seguinte é pedida quando o botão chega perto da
 * tela (rolagem infinita); o botão continua lá para quem navega pelo teclado
 * e para quando a rede falha.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import type {
  MaisProdutosNaTela,
  PaginaNaTela,
  ProdutoNaTela,
  RecorteDaLista,
} from "../../lib/catalogo.ts";

import { CartaoDeProduto, type FormatoDoCartao } from "./CartaoDeProduto.tsx";

/** Sem ids já mostrados. Constante: um `[]` novo a cada render refaria o observador. */
const SEM_IDS: readonly string[] = [];

/** Quanto antes do fim a rolagem infinita já pede a página seguinte. */
const MARGEM_DA_ROLAGEM = "600px 0px";

export interface MaisProdutosProps {
  readonly mais: MaisProdutosNaTela;
  /** Quantos produtos ainda faltam, para o botão dizer. */
  readonly restantes: number;
  readonly nomeDaSecao: string;
  readonly carregar?:
    | ((recorte: RecorteDaLista, cursor: string) => Promise<PaginaNaTela | null>)
    | undefined;
  readonly automatico?: boolean | undefined;
  /**
   * Os produtos que o servidor já desenhou (`children`). A página seguinte não
   * pode repetir nenhum deles (AC-10802), nem quando a loja mudou entre uma
   * página e outra e o deslocamento do cursor passou a apontar para um item que
   * já está na tela.
   */
  readonly jaMostrados?: readonly string[] | undefined;
  /** O mesmo formato do cartão que o servidor já desenhou. */
  readonly formato?: FormatoDoCartao | undefined;
  /** Os itens (`li`) que o servidor já desenhou. */
  readonly children: ReactNode;
}

export function MaisProdutos({
  mais,
  restantes: restantesIniciais,
  nomeDaSecao,
  carregar,
  automatico = false,
  formato = "catalogo",
  jaMostrados = SEM_IDS,
  children,
}: MaisProdutosProps) {
  const [extras, setExtras] = useState<readonly ProdutoNaTela[]>([]);
  const [cursor, setCursor] = useState<string | null>(mais.cursor);
  const [carregando, setCarregando] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const botao = useRef<HTMLAnchorElement>(null);
  // Um pedido por vez: a rolagem dispara o observador várias vezes seguidas.
  const emCurso = useRef(false);

  const carregarMais = useCallback(async () => {
    if (carregar === undefined || cursor === null || emCurso.current) return;
    emCurso.current = true;
    setCarregando(true);
    setFalhou(false);
    try {
      const pagina = await carregar(mais.recorte, cursor);
      if (pagina === null) {
        setFalhou(true);
        return;
      }
      setExtras((atuais) => {
        const vistos = new Set([...jaMostrados, ...atuais.map((p) => p.id)]);
        return [...atuais, ...pagina.produtos.filter((p) => !vistos.has(p.id))];
      });
      setCursor(pagina.proximoCursor);
    } catch {
      setFalhou(true);
    } finally {
      emCurso.current = false;
      setCarregando(false);
    }
  }, [carregar, cursor, mais.recorte, jaMostrados]);

  useEffect(() => {
    const alvo = botao.current;
    if (!automatico || falhou || alvo === null || cursor === null) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((entrada) => entrada.isIntersecting)) {
          void carregarMais();
        }
      },
      { rootMargin: MARGEM_DA_ROLAGEM },
    );
    observador.observe(alvo);
    return () => observador.disconnect();
  }, [automatico, carregarMais, cursor, falhou]);

  const restantes = Math.max(restantesIniciais - extras.length, 0);

  return (
    <>
      <ul className="sc-vitrine__grade">
        {children}
        {extras.map((produto) => (
          <li className="sc-vitrine__item" key={produto.id}>
            <CartaoDeProduto produto={produto} formato={formato} />
          </li>
        ))}
      </ul>
      {/*
        A REGIÃO FALADA EXISTE DESDE O PRIMEIRO RENDER, vazia. Leitor de tela só
        anuncia o que muda dentro de uma região que já estava na página: uma
        mensagem inserida junto com a própria região passa em silêncio. O texto
        do botão ("Tentar de novo") continua lá para quem vê.
      */}
      <p
        className="sc-so-leitor"
        role="status"
        aria-live="polite"
        data-aviso-do-ver-mais=""
      >
        {falhou ? `Não deu para carregar mais produtos de ${nomeDaSecao}.` : ""}
      </p>
      {cursor === null ? null : (
        <div className="sc-vitrine__ver-mais">
          <a
            ref={botao}
            className="sc-vitrine__aba"
            href={mais.link}
            aria-busy={carregando}
            onClick={(evento) => {
              if (carregar === undefined) return;
              evento.preventDefault();
              void carregarMais();
            }}
          >
            {carregando
              ? "Carregando…"
              : falhou
                ? "Não deu para carregar. Tentar de novo"
                : restantes > 0
                  ? `Ver mais ${restantes} ${restantes === 1 ? "produto" : "produtos"}`
                  : "Ver mais"}
            <span className="sc-so-leitor"> de {nomeDaSecao}</span>
          </a>
        </div>
      )}
    </>
  );
}
