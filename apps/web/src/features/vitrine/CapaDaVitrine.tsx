/**
 * A capa do cardápio: o painel do topo da vitrine.
 *
 * O FUNDO É DA MARCA. O painel tem tamanho fixo (proporção 4:1 no computador,
 * a arte recomendada é 1600 × 400 px) e mostra a CAPA que o dono enviou —
 * a mesma da página da loja. Sem capa, vale a capa padrão do tipo de negócio
 * (`capaPadraoDe`). Um véu grafite à esquerda garante a leitura do texto sobre
 * qualquer arte.
 *
 * O TEXTO FICA À ESQUERDA: o NOME DA LOJA em caixa alta no bloco verde-click e,
 * logo abaixo e alinhados a ele, o título da página ("CARDÁPIO") e a situação
 * (o selo: pílula clara ou escura com o LED verde ou vermelho e ABERTO ou
 * FECHADO, legível sobre qualquer capa — `SeloDeStatus.tsx`, card #64). No canto de cima à direita, o
 * "i" abre o Sobre. A metade direita fica livre para a arte da marca.
 *
 * É O ÚNICO LUGAR DA IDENTIDADE no cardápio — não há barra do topo. O nome leva
 * à página da loja; o "i" abre a janela do Sobre por cima do cardápio.
 *
 * DESENHADA NO SERVIDOR, sem script (AC-415).
 */
import type { CSSProperties } from "react";
import { IconeInfo, type PreferenciaDoSelo } from "@simpleclick/ui";

import type { AberturaNaTela } from "../loja/ApresentacaoDaLoja.tsx";
import { capaPadraoDe } from "../../lib/capa-padrao.ts";
import { FotoDaLoja } from "../loja/FotoDaLoja.tsx";
import { atributosDoSelo } from "./SeloDeStatus.tsx";

export interface CapaDaVitrineProps {
  readonly apelidoDaLoja: string;
  readonly nomeDaLoja: string;
  /** A capa que o dono enviou; sem ela, a capa padrão do ramo. */
  readonly capa?: string | null | undefined;
  /** A versão da capa para o celular (telas estreitas); nula: vale a do computador. */
  readonly capaCelular?: string | null | undefined;
  /** O código do tipo de negócio, que escolhe a capa padrão. */
  readonly ramo?: string | null | undefined;
  /** Como a loja chama o catálogo: "Cardápio", "Catálogo". */
  readonly rotuloDoCatalogo: string;
  readonly abertura: AberturaNaTela;
  /** Selo de status que o dono escolheu (padrão: automático). */
  readonly seloDeStatus?: PreferenciaDoSelo | null | undefined;
  /** A cor medida da capa em uso, que o automático usa. */
  readonly corDaCapa?: string | null | undefined;
}

export function CapaDaVitrine({
  apelidoDaLoja,
  nomeDaLoja,
  capa = null,
  capaCelular = null,
  ramo = null,
  rotuloDoCatalogo,
  abertura,
  seloDeStatus = null,
  corDaCapa = null,
}: CapaDaVitrineProps) {
  const enderecoDaLoja = `/loja/${apelidoDaLoja}`;
  // Nome comprido ganha letra menor (do tablet em diante pode quebrar em duas
  // linhas); no celular a letra sai da quantidade de letras, numa linha só.
  const tamanhoDoNome =
    nomeDaLoja.length > 30
      ? "longo"
      : nomeDaLoja.length > 18
        ? "medio"
        : "curto";
  const selo = atributosDoSelo({
    preferencia: seloDeStatus,
    corDoFundo: corDaCapa,
    aberta: abertura.aberta,
  });

  return (
    <header
      className={`sc-vitrine__capa ${capa ? "sc-vitrine__capa--com-capa" : "sc-vitrine__capa--padrao"}`}
    >
      {/* O fundo é ambiente: o nome da loja já está no título. */}
      {capa ? (
        <FotoDaLoja
          className="sc-vitrine__capa-fundo"
          src={capa}
          celular={capaCelular}
        />
      ) : (
        <span
          className="sc-vitrine__capa-fundo"
          aria-hidden="true"
          data-capa-padrao={ramo ?? ""}
          style={
            { "--capa-url": `url(${capaPadraoDe(ramo)})` } as CSSProperties
          }
        />
      )}
      <span className="sc-vitrine__capa-veu" aria-hidden="true" />

      {/* O "i" do Sobre, no canto: abre a janela por cima do cardápio. */}
      <a
        className="sc-vitrine__capa-sobre"
        href={`/loja/${apelidoDaLoja}/sobre`}
        data-abre-sobre=""
        aria-label={`Sobre ${nomeDaLoja}`}
      >
        <IconeInfo aria-hidden="true" />
      </a>

      <div className="sc-vitrine__capa-conteudo">
        <a className="sc-vitrine__capa-marca" href={enderecoDaLoja}>
          <span
            className={`sc-vitrine__capa-nome sc-vitrine__capa-nome--${tamanhoDoNome}`}
            // No celular o nome fica numa linha só e a letra se ajusta pela
            // quantidade de letras; se nem no mínimo couber, as reticências
            // cortam a vista — o nome inteiro continua no texto e no `title`.
            style={{ "--letras-do-nome": nomeDaLoja.length } as CSSProperties}
            title={nomeDaLoja}
          >
            <span className="sc-marcador">{nomeDaLoja}</span>
          </span>
        </a>

        {/* Alinhados ao nome: a página e se a loja está aberta. */}
        <div className="sc-vitrine__capa-pagina">
          <h1 className="sc-vitrine__titulo">
            {rotuloDoCatalogo}
            <span className="sc-so-leitor"> de {nomeDaLoja}</span>
          </h1>
          <p
            className={`sc-vitrine__capa-situacao sc-vitrine__capa-situacao--${
              abertura.aberta ? "aberta" : "fechada"
            } ${selo.className}`}
            style={selo.style}
            data-selo={selo["data-selo"]}
            title={
              abertura.aberta
                ? "Aberta agora · peça pelo WhatsApp"
                : (abertura.proximaAbertura ?? undefined)
            }
          >
            <span className="sc-vitrine__capa-ponto" aria-hidden="true" />
            {abertura.aberta ? "Aberto" : "Fechado"}
            {!abertura.aberta && abertura.proximaAbertura ? (
              <span className="sc-so-leitor">, {abertura.proximaAbertura}</span>
            ) : null}
          </p>
        </div>
      </div>
    </header>
  );
}
