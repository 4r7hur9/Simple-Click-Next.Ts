"use client";

/**
 * O cardápio na televisão da loja (AC-925 a AC-931).
 *
 * NÃO É A VITRINE NUMA TELA GRANDE. Ninguém rola, ninguém toca, ninguém está
 * com o celular na mão — quem lê está a três metros, na fila, decidindo em
 * quinze segundos. A tela avança sozinha, fica ligada o dia inteiro, e precisa
 * continuar de pé quando a internet da loja cair. Cada uma dessas três frases
 * é um gancho abaixo: `useRodizio`, `useCatalogoDaTv` e a densidade medida da
 * janela.
 *
 * É COMPONENTE DE CLIENTE, e é a exceção consciente à regra da vitrine: aqui o
 * script não é peso, é o produto. Sem ele a tela não avança e não se atualiza.
 * Ainda assim, o servidor desenha a primeira tela com o catálogo que já tem,
 * então a televisão mostra produto antes de o script chegar.
 *
 * OS QUATRO ESTADOS (P-011): carregando enquanto não há catálogo nenhum, erro
 * quando a rede falhou antes de haver um, vazio quando nada está disponível, e
 * o rodízio quando há o que mostrar. Queda de rede DEPOIS de haver catálogo
 * não é erro: é uma linha discreta no rodapé (AC-929).
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Carregando, Erro, TemaDaLoja, Vazio } from "@simpleclick/ui";

import type { CatalogoDaVitrineNoContrato } from "@simpleclick/contracts";

import { CodigoParaOCelular } from "./CodigoParaOCelular.tsx";
import {
  calcularDensidade,
  MEDIDAS_INICIAIS,
  type MedidasDaTela,
} from "./densidade.ts";
import { montarTelas } from "./telas.ts";
import {
  SEGUNDOS_ENTRE_ATUALIZACOES,
  useCatalogoDaTv,
  type BuscadorDeCatalogo,
} from "./useCatalogoDaTv.ts";
import { SEGUNDOS_POR_TELA, useRodizio } from "./useRodizio.ts";

/** O que a exibição precisa saber da loja. */
export interface LojaNaTv {
  readonly apelido: string;
  readonly nome: string;
  /** "Cardápio" na lanchonete, "Catálogo" na loja de roupas. */
  readonly rotuloDoCatalogo: string;
  readonly corPrincipal: string;
}

export interface ExibicaoDeCardapioProps {
  readonly loja: LojaNaTv;
  /** O catálogo que o servidor já entregou. Nulo quando ele não conseguiu. */
  readonly catalogoInicial: CatalogoDaVitrineNoContrato | null;
  /** O endereço absoluto da vitrine, para o código de leitura. */
  readonly enderecoDaVitrine: string;
  readonly segundosPorTela?: number | undefined;
  readonly segundosEntreAtualizacoes?: number | undefined;
  /** Quem busca o catálogo. A prova responde sem rede. */
  readonly buscar?: BuscadorDeCatalogo | undefined;
  /** As medidas antes de medir a janela. A prova fixa a televisão. */
  readonly medidasIniciais?: MedidasDaTela | undefined;
}

/** Mede a janela, e mede de novo quando ela muda. */
function useMedidasDaJanela(iniciais: MedidasDaTela): MedidasDaTela {
  const [medidas, setMedidas] = useState(iniciais);

  useEffect(() => {
    const medir = (): void => {
      setMedidas({ largura: window.innerWidth, altura: window.innerHeight });
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);

  return medidas;
}

/** O horário curto, para o rodapé dizer quando foi a última atualização. */
function horarioCurto(instante: number): string {
  return new Date(instante).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** A parede inteira: escolhe entre os quatro estados e, com catálogo, gira as telas do rodízio. */
export function ExibicaoDeCardapio({
  loja,
  catalogoInicial,
  enderecoDaVitrine,
  segundosPorTela = SEGUNDOS_POR_TELA,
  segundosEntreAtualizacoes = SEGUNDOS_ENTRE_ATUALIZACOES,
  buscar,
  medidasIniciais = MEDIDAS_INICIAIS,
}: ExibicaoDeCardapioProps) {
  const medidas = useMedidasDaJanela(medidasIniciais);
  const densidade = useMemo(() => calcularDensidade(medidas), [medidas]);

  const { catalogo, situacao, atualizadoEm, semRede } = useCatalogoDaTv({
    apelido: loja.apelido,
    catalogoInicial,
    intervaloEmMs: segundosEntreAtualizacoes * 1000,
    buscar,
  });

  const telas = useMemo(
    () =>
      catalogo === null ? [] : montarTelas(catalogo, densidade.produtosPorTela),
    [catalogo, densidade.produtosPorTela],
  );
  const indice = useRodizio(telas.length, segundosPorTela * 1000);
  const tela = telas[indice] ?? null;

  const estilo = {
    "--corpo": `${String(densidade.corpoEmPx)}px`,
    "--colunas": String(densidade.colunas),
  } as CSSProperties;

  return (
    <TemaDaLoja
      corPrincipal={loja.corPrincipal}
      tema="escuro"
      className="sc-exibicao"
    >
      <main
        className="sc-exibicao__tela"
        data-orientacao={densidade.orientacao}
        data-tela={tela === null ? undefined : String(indice)}
        style={estilo}
      >
        <header className="sc-exibicao__cabecalho">
          <h1 className="sc-exibicao__loja">{loja.nome}</h1>
          {tela === null ? null : (
            <h2 className="sc-exibicao__secao" key={tela.chave}>
              {tela.secao}
            </h2>
          )}
        </header>

        <section
          className="sc-exibicao__produtos"
          aria-label={loja.rotuloDoCatalogo}
        >
          {situacao === "carregando" ? (
            <Carregando
              rotulo={`Carregando o ${loja.rotuloDoCatalogo.toLowerCase()}…`}
              className="sc-exibicao__estado"
            />
          ) : situacao === "erro" ? (
            // Sem catálogo NENHUM: não há o que manter no ar. A tela diz o que
            // houve e que vai tentar sozinha — ninguém vai apertar nada.
            <Erro
              titulo={`O ${loja.rotuloDoCatalogo.toLowerCase()} não carregou`}
              mensagem="A televisão vai tentar de novo sozinha assim que a conexão voltar."
              className="sc-exibicao__estado"
            />
          ) : tela === null ? (
            <Vazio
              titulo={`O ${loja.rotuloDoCatalogo.toLowerCase()} está sendo montado`}
              descricao={`${loja.nome} ainda não tem produto disponível para mostrar.`}
              className="sc-exibicao__estado"
            />
          ) : (
            // A chave troca a lista inteira a cada tela: é o que faz a
            // entrada animar de novo (e o leitor de tela não é interrompido,
            // porque nada aqui é região viva).
            <ol className="sc-exibicao__lista" key={tela.chave}>
              {tela.produtos.map((produto) => (
                <li className="sc-exibicao__produto" key={produto.id}>
                  <span className="sc-exibicao__nome">{produto.nome}</span>
                  {produto.chamada ? (
                    <span className="sc-exibicao__chamada">
                      {produto.chamada}
                    </span>
                  ) : null}
                  <span className="sc-exibicao__precos">
                    {produto.precoAnterior ? (
                      <s className="sc-exibicao__preco-anterior">
                        <span className="sc-so-leitor">De </span>
                        {produto.precoAnterior}
                      </s>
                    ) : null}
                    {produto.preco ? (
                      <span className="sc-exibicao__preco">
                        {produto.precoAnterior ? (
                          <span className="sc-so-leitor">por </span>
                        ) : null}
                        {produto.preco}
                      </span>
                    ) : (
                      // Preço que depende de variação não vira "a partir de"
                      // inventado aqui: o celular mostra as opções.
                      <span className="sc-exibicao__preco sc-exibicao__preco--variavel">
                        veja no celular
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="sc-exibicao__ponte" aria-label="Peça pelo celular">
          <CodigoParaOCelular enderecoDaVitrine={enderecoDaVitrine} />
        </aside>

        <footer className="sc-exibicao__rodape">
          {telas.length > 1 ? (
            <span className="sc-exibicao__passo">
              {String(indice + 1)} de {String(telas.length)}
            </span>
          ) : null}
          {semRede ? (
            // Não é tela de erro (AC-929): o cardápio continua no ar, e esta
            // linha só explica, a quem olhar de perto, por que ele pode estar
            // um pouco atrasado.
            <span className="sc-exibicao__aviso">
              Sem conexão — mostrando o {loja.rotuloDoCatalogo.toLowerCase()}{" "}
              {atualizadoEm === null
                ? "recebido"
                : `das ${horarioCurto(atualizadoEm)}`}
            </span>
          ) : atualizadoEm === null ? null : (
            <span className="sc-exibicao__atualizado">
              Atualizado às {horarioCurto(atualizadoEm)}
            </span>
          )}
        </footer>
      </main>
    </TemaDaLoja>
  );
}
