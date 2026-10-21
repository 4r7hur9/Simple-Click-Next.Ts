/**
 * O mapa do site de uma loja (AC-403).
 *
 * UM MAPA POR LOJA, e não um do site inteiro. O SimpleClick é multi-loja: um
 * mapa único cresceria com o número de assinantes e obrigaria a listar todas as
 * lojas para servir qualquer uma — cada visita de robô puxaria a plataforma
 * inteira. Por loja, o custo de servir é o catálogo de uma loja, e o robô que
 * indexa a padaria não paga pela loja de roupa.
 *
 * O QUE ELE FAZ QUE O LINK NÃO FAZ. O buscador só encontra o que está linkado
 * de algum lugar que ele já conhece — e uma loja recém-criada não está linkada
 * de lugar nenhum. O mapa é o caminho de entrada: o dono cadastra o produto
 * hoje e o produto pode ser encontrado sem esperar alguém compartilhar o link.
 *
 * POR QUE NÃO É UM `sitemap.ts` DO FRAMEWORK. O Next tem a convenção, e ela não
 * serve aqui: dentro de um segmento dinâmico ele NÃO passa `params` para a
 * função — o caminho previsto é `generateSitemaps`, que pede a lista de ids
 * antecipadamente. Isso é exatamente o mapa único que o parágrafo acima recusa:
 * seria enumerar todas as lojas da plataforma para servir a de uma. A rota
 * própria devolve o mesmo endereço (`/loja/{apelido}/sitemap.xml`) sem essa
 * enumeração. Descoberto rodando o cenário de ponta a ponta, e não por leitura.
 *
 * SEM `lastModified`, e a ausência é decisão. O campo pede a data em que AQUELE
 * endereço mudou, e o que temos é `versao` do catálogo — um contador, não uma
 * data. Preencher com `new Date()` faria toda visita dizer "mudou agora", e o
 * buscador aprende a ignorar o campo de quem mente: seria pior que deixá-lo
 * vazio. Entra quando a API publicar a data de alteração do produto.
 */
import {
  enderecoDaLoja,
  enderecoDoCatalogo,
  enderecoDoProduto,
  enderecoSobreDaLoja,
} from "./endereco-do-site.ts";
import { buscarCatalogo, buscarVitrine } from "./vitrine.ts";

/** Uma linha do mapa: o endereço e a frequência com que ele costuma mudar. */
export interface PaginaNoMapa {
  readonly url: string;
  readonly mudaCom: "daily" | "weekly";
  readonly prioridade: number;
}

/**
 * Monta o mapa de uma loja.
 *
 * `buscar` entra por parâmetro para o teste conseguir responder sem rede — sem
 * isso a única prova possível seria "roda contra o ambiente no ar".
 */
export async function mapaDaLoja(
  apelido: string,
  buscar: typeof fetch = fetch,
): Promise<readonly PaginaNoMapa[]> {
  const [vitrine, catalogo] = await Promise.all([
    buscarVitrine(apelido, buscar),
    buscarCatalogo(apelido, {}, buscar),
  ]);

  // LOJA INDISPONÍVEL DEVOLVE MAPA VAZIO, e não erro. Loja suspensa e loja
  // inexistente respondem igual (AC-402), e um mapa que estourasse contaria ao
  // robô que aquele endereço existe — pela diferença entre 500 e 200.
  if (vitrine.estado !== "encontrada") return [];

  const { loja } = vitrine.vitrine;

  const paginas: PaginaNoMapa[] = [
    { url: enderecoDaLoja(loja.apelido), mudaCom: "weekly", prioridade: 1 },
    {
      url: enderecoSobreDaLoja(loja.apelido),
      mudaCom: "weekly",
      prioridade: 0.8,
    },
    {
      url: enderecoDoCatalogo(loja.apelido),
      mudaCom: "daily",
      prioridade: 0.9,
    },
  ];

  // Catálogo fora do ar não derruba o mapa: a apresentação e o catálogo
  // continuam listados, e o robô volta. Um mapa que falha inteiro por causa de
  // uma rota faz o buscador desistir das duas páginas que estavam certas.
  if (catalogo.estado !== "encontrado") return paginas;

  // O MESMO PRODUTO PODE ESTAR EM DUAS SEÇÕES (a coxinha em "Salgados" e em
  // "Promoções"), e o endereço dele é um só. Repeti-lo no mapa é o tipo de
  // duplicata que o canônico existe para desfazer — não custa nada não criar.
  const vistos = new Set<string>();

  for (const secao of catalogo.catalogo.secoes) {
    for (const produto of secao.produtos) {
      if (vistos.has(produto.id)) continue;
      vistos.add(produto.id);
      paginas.push({
        url: enderecoDoProduto(loja.apelido, produto.id),
        mudaCom: "weekly",
        prioridade: 0.7,
      });
    }
  }

  return paginas;
}

/**
 * Escapa o que o XML não aceita cru.
 *
 * O apelido da loja é restrito a letras, números e hífen pelo contrato, então
 * hoje nenhum endereço daqui carrega `&` ou `<`. Escapar assim mesmo é barato e
 * sobrevive ao dia em que o endereço passar a ter parâmetro — um mapa com XML
 * malformado é descartado inteiro pelo buscador, sem aviso.
 */
function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escreve o mapa no formato que o protocolo de sitemaps define. */
export function xmlDoMapa(paginas: readonly PaginaNoMapa[]): string {
  const linhas = paginas.map(
    (pagina) =>
      `  <url>\n` +
      `    <loc>${escaparXml(pagina.url)}</loc>\n` +
      `    <changefreq>${pagina.mudaCom}</changefreq>\n` +
      `    <priority>${pagina.prioridade}</priority>\n` +
      `  </url>`,
  );

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${linhas.join("\n")}${linhas.length === 0 ? "" : "\n"}` +
    `</urlset>\n`
  );
}
