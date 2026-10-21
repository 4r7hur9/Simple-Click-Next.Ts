/**
 * Os cartões do feed (card #37): produto (leva à página do produto na loja)
 * e loja (leva à vitrine, com a estrela de favoritar).
 */
import Image from "next/image";
import Link from "next/link";
import type { LojaDoFeed, ProdutoDoFeed } from "@simpleclick/contracts";
import { IconeEntrega, IconeLocal, IconeLoja } from "@simpleclick/ui";

import { chamadaDoAtacado } from "../../lib/atacado-na-vitrine.ts";
import { escreverDinheiro } from "../../lib/dinheiro.ts";
import { BotaoFavoritar } from "./BotaoFavoritar.tsx";
import {
  enderecoDoFeed,
  escreverDistancia,
  escreverFormas,
  type ConsultaDoFeed,
} from "./consulta.ts";

function onde(bairro: string | null, cidade: string | null): string {
  return [bairro, cidade].filter(Boolean).join(", ");
}

export function CartaoDeProduto({
  produto,
  consulta,
  prioridade = false,
}: {
  readonly produto: ProdutoDoFeed;
  readonly consulta: ConsultaDoFeed;
  readonly prioridade?: boolean;
}) {
  const distancia = escreverDistancia(produto.distanciaKm);
  const temDesconto =
    produto.precoOriginalCentavos !== null &&
    produto.precoCentavos !== null &&
    produto.precoOriginalCentavos > produto.precoCentavos;
  // Varejo e atacado juntos (card #56); sem faixa, nada muda.
  const atacado =
    produto.precoCentavos === null ? null : chamadaDoAtacado(produto.atacado);
  return (
    <li className="sc-feed__cartao sc-feed__cartao--produto" data-produto={produto.id}>
      <Link
        className="sc-feed__link"
        href={`/loja/${produto.loja.apelido}/produto/${produto.id}`}
      >
        <span className="sc-feed__foto">
          {produto.imagem ? (
            <Image
              src={produto.imagem}
              alt=""
              width={480}
              height={360}
              priority={prioridade}
              loading={prioridade ? undefined : "lazy"}
              sizes="(max-width: 640px) 50vw, 280px"
            />
          ) : (
            <span className="sc-feed__sem-foto" aria-hidden="true">
              {produto.nome.slice(0, 1).toUpperCase()}
            </span>
          )}
          {distancia === null ? null : (
            <span className="sc-feed__distancia">{distancia}</span>
          )}
        </span>
        <span className="sc-feed__texto">
          <span className="sc-feed__nome">{produto.nome}</span>
          <span className="sc-feed__preco">
            {produto.precoCentavos === null ? (
              "Ver opções"
            ) : (
              <>
                {temDesconto ? (
                  <s className="sc-feed__preco-de">
                    {escreverDinheiro(produto.precoOriginalCentavos ?? 0)}
                  </s>
                ) : null}
                {escreverDinheiro(produto.precoCentavos)}
              </>
            )}
          </span>
          {atacado === null ? null : (
            <span className="sc-feed__atacado">{atacado}</span>
          )}
          <span className="sc-feed__loja">
            <IconeLoja aria-hidden="true" size={14} /> {produto.loja.nome}
          </span>
        </span>
      </Link>
      {produto.categoria ? (
        <Link
          className="sc-feed__etiqueta"
          href={enderecoDoFeed(consulta, { categoria: produto.categoria })}
          aria-label={`Ver mais de ${produto.categoria}`}
        >
          {produto.categoria}
        </Link>
      ) : null}
    </li>
  );
}

export function CartaoDeLoja({
  loja,
  logado,
  voltarPara,
}: {
  readonly loja: LojaDoFeed;
  readonly logado: boolean;
  readonly voltarPara: string;
}) {
  const distancia = escreverDistancia(loja.distanciaKm);
  const formas = escreverFormas(loja.formasDeEntrega);
  const local = onde(loja.bairro, loja.cidade);
  return (
    <li className="sc-feed__cartao sc-feed__cartao--loja" data-loja={loja.apelido}>
      <Link className="sc-feed__link" href={`/loja/${loja.apelido}`}>
        <span className="sc-feed__capa">
          {loja.capa ? <img src={loja.capa} alt="" loading="lazy" /> : null}
          <span className="sc-feed__logo">
            {loja.logo ? (
              <img src={loja.logo} alt="" loading="lazy" />
            ) : (
              <IconeLoja aria-hidden="true" />
            )}
          </span>
        </span>
        <span className="sc-feed__texto">
          <span className="sc-feed__nome">{loja.nome}</span>
          <span className="sc-feed__meta">{loja.tipoDeNegocioNome}</span>
          {local === "" && distancia === null ? null : (
            <span className="sc-feed__meta">
              <IconeLocal aria-hidden="true" size={14} />{" "}
              {[distancia, local].filter(Boolean).join(" · ")}
            </span>
          )}
          {formas === null ? null : (
            <span className="sc-feed__meta">
              <IconeEntrega aria-hidden="true" size={14} /> {formas}
            </span>
          )}
          {loja.produtosNoFeed > 0 ? (
            <span className="sc-feed__meta sc-feed__meta--destaque">
              {loja.produtosNoFeed === 1
                ? "1 produto em destaque"
                : `${loja.produtosNoFeed} produtos em destaque`}
            </span>
          ) : null}
        </span>
      </Link>
      <BotaoFavoritar
        apelido={loja.apelido}
        nome={loja.nome}
        favorita={loja.favorita}
        logado={logado}
        voltarPara={voltarPara}
      />
    </li>
  );
}
