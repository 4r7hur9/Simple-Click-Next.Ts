/**
 * Os cartões do feed (card #37), no desenho do Stitch (card #128): produto
 * (foto, loja em verde, nome, preço grande e o "+" redondo; leva à página do
 * produto na loja) e loja (capa, logo, tipo, local e formas de receber; leva
 * à vitrine, com a estrela de favoritar).
 *
 * Só dado real: nada de nota, prazo, "aberta agora" ou selo (funções "A
 * decidir" seguem ocultas).
 */
import Image from "next/image";
import Link from "next/link";
import type { LojaDoFeed, ProdutoDoFeed } from "@simpleclick/contracts";
import {
  IconeAdicionar,
  IconeBrilho,
  IconeEntrega,
  IconeLocal,
  IconeLoja,
} from "@simpleclick/ui";

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

/** "R$ 8,68" com o "R$" menor, como no Stitch (o texto lido é o mesmo). */
export function Preco({ centavos }: { readonly centavos: number }) {
  const texto = escreverDinheiro(centavos);
  const corte = texto.search(/\s/);
  if (corte < 0) return <>{texto}</>;
  return (
    <>
      <span className="sc-feed__moeda">{texto.slice(0, corte)}</span>
      {texto.slice(corte)}
    </>
  );
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
  const curtidas = produto.curtidas ?? 0;
  return (
    <li
      className="sc-feed__cartao sc-feed__cartao--produto"
      data-produto={produto.id}
    >
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
              height={480}
              priority={prioridade}
              loading={prioridade ? undefined : "lazy"}
              sizes="(max-width: 640px) 50vw, 300px"
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
          <span className="sc-feed__loja">{produto.loja.nome}</span>
          <span className="sc-feed__nome">{produto.nome}</span>
          {produto.descricao ? (
            <span className="sc-feed__descricao">{produto.descricao}</span>
          ) : null}
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
                <span className="sc-feed__preco-por">
                  <Preco centavos={produto.precoCentavos} />
                </span>
              </>
            )}
          </span>
          {atacado === null ? null : (
            <span className="sc-feed__atacado">{atacado}</span>
          )}
        </span>
        {/* O "+" do Stitch: só desenho; o cartão inteiro já é o link. */}
        <span className="sc-feed__mais" aria-hidden="true">
          <IconeAdicionar size={20} />
        </span>
      </Link>
      <span className="sc-feed__pe">
        {curtidas > 0 ? (
          <span className="sc-feed__curtidas">
            <IconeBrilho aria-hidden="true" size={14} preenchido />
            <span className="sc-feed__oculto">Curtidas:</span> {curtidas}
          </span>
        ) : null}
        {produto.categoria ? (
          <Link
            className="sc-feed__etiqueta"
            href={enderecoDoFeed(consulta, { categoria: produto.categoria })}
            aria-label={`Ver mais de ${produto.categoria}`}
          >
            {produto.categoria}
          </Link>
        ) : null}
      </span>
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
  const ondeFica = [distancia, local].filter(Boolean).join(" · ");
  return (
    <li
      className="sc-feed__cartao sc-feed__cartao--loja"
      data-loja={loja.apelido}
    >
      <Link className="sc-feed__link" href={`/loja/${loja.apelido}`}>
        <span className="sc-feed__capa">
          {loja.capa ? <img src={loja.capa} alt="" loading="lazy" /> : null}
          <span className="sc-feed__tipo">{loja.tipoDeNegocioNome}</span>
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
          <span className="sc-feed__meta">
            {loja.produtosNoFeed > 0
              ? loja.produtosNoFeed === 1
                ? "1 produto em destaque"
                : `${loja.produtosNoFeed} produtos em destaque`
              : loja.tipoDeNegocioNome}
          </span>
          {ondeFica === "" && formas === null ? null : (
            <span className="sc-feed__rodape-da-loja">
              {ondeFica === "" ? (
                <span />
              ) : (
                <span className="sc-feed__meta">
                  <IconeLocal aria-hidden="true" size={14} /> {ondeFica}
                </span>
              )}
              {formas === null ? null : (
                <span className="sc-feed__meta sc-feed__meta--destaque">
                  <IconeEntrega aria-hidden="true" size={14} /> {formas}
                </span>
              )}
            </span>
          )}
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
