/**
 * Os dados estruturados da loja e do produto (AC-403, AC-414).
 *
 * O QUE ISTO COMPRA. O buscador lê a página como texto e adivinha o resto: o
 * que é preço, o que é endereço, o que é horário. Os dados estruturados param
 * de fazer ele adivinhar — e é o que faz a loja aparecer com preço, endereço e
 * "aberto agora" no resultado, em vez de aparecer como um link qualquer. É
 * vantagem direta sobre o concorrente, cujo cardápio não é indexável.
 *
 * SÃO FUNÇÕES PURAS, e o endereço base entra por parâmetro. Ler `URL_DO_SITE`
 * daqui faria este arquivo depender do processo do servidor — e ele mora em
 * `lib`, que a camada de componentes também alcança, onde a variável é
 * `undefined`. Por parâmetro, o valor errado é impossível de esconder e o teste
 * não precisa de ambiente nenhum.
 *
 * O VOCABULÁRIO SEGUE O RAMO. Buscador entende `Restaurant` + `Menu` para quem
 * serve comida e `Store` + `OfferCatalog` para quem vende objeto — e mandar o
 * par errado não é impreciso, é descartado: o buscador ignora o bloco inteiro.
 * Quem decide é `loja.alimentacao`, que vem do banco: a regra sobre ramos não
 * mora aqui, e ramo novo nasce classificado certo sem tocar neste arquivo.
 */
import type { LojaPublicaNoContrato } from "@simpleclick/contracts";

import type { CatalogoNaTela, ProdutoNaTela } from "./catalogo.ts";

/**
 * Um bloco de dados estruturados, como ele sai para o HTML.
 *
 * `unknown` no valor, e não `any`: o formato do schema.org é aninhado e
 * heterogêneo, e tipá-lo por inteiro seria copiar um vocabulário de centenas de
 * termos que ninguém manteria em dia.
 */
export type DadoEstruturado = Readonly<Record<string, unknown>>;

/** O que estas funções precisam saber além da loja. */
export interface ContextoDosDados {
  /** Endereço absoluto do site, sem barra no fim. */
  readonly enderecoDoSite: string;
}

/** Remove as chaves nulas: schema.org prefere ausência a campo vazio. */
function semVazios(objeto: Record<string, unknown>): DadoEstruturado {
  const limpo: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(objeto)) {
    if (valor === null || valor === undefined) continue;
    if (Array.isArray(valor) && valor.length === 0) continue;
    limpo[chave] = valor;
  }
  return limpo;
}

/**
 * O endereço postal, quando a loja tem um.
 *
 * SÓ SAI O QUE JÁ É PÚBLICO. A vitrine mostra este endereço para quem vai
 * retirar o pedido, e o contrato já o entrega sem CEP e sem coordenada — o que
 * entra aqui é o mesmo, e não mais.
 */
function enderecoPostal(
  endereco: LojaPublicaNoContrato["enderecoParaRetirada"],
): DadoEstruturado | null {
  if (endereco === null) return null;

  const rua = [endereco.logradouro, endereco.numero]
    .filter((parte) => parte !== null && parte !== "")
    .join(", ");

  const partes = semVazios({
    "@type": "PostalAddress",
    streetAddress: rua === "" ? null : rua,
    addressLocality: endereco.cidade,
    addressRegion: endereco.uf,
    addressCountry: "BR",
  });

  // Só o `@type` significa endereço vazio, e endereço vazio é pior que nenhum:
  // o buscador o exibe como um campo em branco no resultado.
  return Object.keys(partes).length <= 2 ? null : partes;
}

export interface NegocioDaLojaOpcoes extends ContextoDosDados {
  readonly loja: LojaPublicaNoContrato;
}

/**
 * O bloco de NEGÓCIO da loja (AC-403).
 *
 * `Restaurant` e `Store` são os dois tipos que o buscador reconhece com ficha
 * própria no resultado — com endereço, nota e o botão de abrir. Um `Thing`
 * genérico aparece como link comum, que é o que a loja já tinha.
 */
export function negocioDaLoja({
  loja,
  enderecoDoSite,
}: NegocioDaLojaOpcoes): DadoEstruturado {
  const endereco = `${enderecoDoSite}/l/${loja.apelido}`;

  return semVazios({
    "@context": "https://schema.org",
    "@type": loja.alimentacao ? "Restaurant" : "Store",
    "@id": endereco,
    name: loja.nome,
    url: endereco,
    description: loja.boasVindas,
    image: loja.capa ?? loja.logo,
    logo: loja.logo,
    address: enderecoPostal(loja.enderecoParaRetirada),
    currenciesAccepted: loja.moeda,
    // O CARDÁPIO É UM ENDEREÇO, e não o conteúdo dele: o buscador segue o link
    // e lê os dados estruturados de lá. Repetir o catálogo inteiro aqui faria a
    // página da loja carregar o peso do catálogo sem mostrá-lo (AC-415).
    ...(loja.alimentacao
      ? { hasMenu: `${endereco}/catalogo` }
      : {
          hasOfferCatalog: {
            "@type": "OfferCatalog",
            url: `${endereco}/catalogo`,
          },
        }),
    // SEM `openingHours`, e a ausência é decisão. O contrato entrega "aberta
    // agora" (AC-401), que é do MOMENTO; `openingHours` descreve a GRADE da
    // semana. Derivar a grade de um instante faria o buscador anunciar como
    // permanente o que vale para hoje — a loja apareceria "aberta" de
    // madrugada, e alguém iria até lá. A grade existe no banco
    // (`store_hours`), e entra quando o contrato a publicar.
  });
}

export interface CardapioDaLojaOpcoes extends ContextoDosDados {
  readonly loja: LojaPublicaNoContrato;
  readonly catalogo: CatalogoNaTela;
}

/** Um item do catálogo, no vocabulário que o ramo pede. */
function itemDoCatalogo(
  produto: ProdutoNaTela,
  loja: LojaPublicaNoContrato,
  enderecoDoSite: string,
): DadoEstruturado {
  const endereco = `${enderecoDoSite}${produto.link}`;

  return semVazios({
    "@type": loja.alimentacao ? "MenuItem" : "Product",
    name: produto.nome,
    description: produto.chamada,
    url: endereco,
    image: produto.imagem,
    // O PREÇO ESCRITO NÃO SERVE AO BUSCADOR: ele quer o número e a moeda em
    // campos separados. "R$ 7,50" viraria zero, ou seria descartado.
    ...(produto.precoCentavos === null
      ? {}
      : {
          offers: semVazios({
            "@type": "Offer",
            price: (produto.precoCentavos / 100).toFixed(2),
            priceCurrency: loja.moeda,
            availability: produto.disponivel
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
            url: endereco,
          }),
        }),
  });
}

/**
 * O bloco do CATÁLOGO (AC-403).
 *
 * As seções entram como seções, e não como uma lista achatada: é a hierarquia
 * que faz o buscador mostrar "Salgados · Bebidas" em vez de trinta itens soltos.
 */
export function cardapioDaLoja({
  loja,
  catalogo,
  enderecoDoSite,
}: CardapioDaLojaOpcoes): DadoEstruturado {
  const endereco = `${enderecoDoSite}/l/${loja.apelido}/catalogo`;

  const secoes = catalogo.secoes.map((secao) =>
    semVazios({
      "@type": loja.alimentacao ? "MenuSection" : "OfferCatalog",
      name: secao.nome,
      ...(loja.alimentacao
        ? {
            hasMenuItem: secao.produtos.map((p) =>
              itemDoCatalogo(p, loja, enderecoDoSite),
            ),
          }
        : {
            itemListElement: secao.produtos.map((p) =>
              itemDoCatalogo(p, loja, enderecoDoSite),
            ),
          }),
    }),
  );

  return semVazios({
    "@context": "https://schema.org",
    "@type": loja.alimentacao ? "Menu" : "OfferCatalog",
    "@id": endereco,
    name: `${loja.rotulos.catalogo} · ${loja.nome}`,
    url: endereco,
    ...(loja.alimentacao
      ? { hasMenuSection: secoes }
      : { itemListElement: secoes }),
  });
}

export interface ProdutoParaBuscadorOpcoes extends ContextoDosDados {
  readonly loja: LojaPublicaNoContrato;
  readonly nome: string;
  readonly descricao: string | null;
  readonly imagens: readonly string[];
  readonly precoCentavos: number | null;
  readonly disponivel: boolean;
  readonly enderecoDoProduto: string;
}

/**
 * O bloco de um PRODUTO (AC-414).
 *
 * `Product` com `Offer` é o que produz o preço no resultado da busca e na
 * prévia do compartilhamento. Sem a oferta, o produto aparece sem preço — e
 * preço é a informação que decide se a pessoa abre o link.
 *
 * PRODUTO SEM PREÇO ÚNICO não recebe oferta nenhuma, e isso é deliberado: o
 * preço depende de variação, e escolher um número aqui prometeria ao buscador
 * um valor que a página não cobra.
 */
export function produtoParaBuscador({
  loja,
  nome,
  descricao,
  imagens,
  precoCentavos,
  disponivel,
  enderecoDoProduto,
}: ProdutoParaBuscadorOpcoes): DadoEstruturado {
  return semVazios({
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": enderecoDoProduto,
    name: nome,
    description: descricao,
    image: [...imagens],
    url: enderecoDoProduto,
    brand: { "@type": "Brand", name: loja.nome },
    ...(precoCentavos === null
      ? {}
      : {
          offers: semVazios({
            "@type": "Offer",
            price: (precoCentavos / 100).toFixed(2),
            priceCurrency: loja.moeda,
            availability: disponivel
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
            url: enderecoDoProduto,
            seller: { "@type": "Organization", name: loja.nome },
          }),
        }),
  });
}

export interface DadosEstruturadosProps {
  readonly dados: DadoEstruturado;
}

/**
 * Desenha um bloco de dados estruturados na página.
 *
 * `dangerouslySetInnerHTML` é o caminho OBRIGATÓRIO aqui: o React escaparia as
 * aspas do JSON como entidades HTML, e o buscador receberia um bloco que não
 * é JSON. O conteúdo não é texto de usuário — é o resultado de `JSON.stringify`
 * sobre dados que já passaram pelo contrato — e o `<` é escapado assim mesmo,
 * porque `</script>` dentro de um nome de produto fecharia a etiqueta.
 */
export function DadosEstruturados({ dados }: DadosEstruturadosProps) {
  const json = JSON.stringify(dados).replace(/</g, "\\u003c");

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
