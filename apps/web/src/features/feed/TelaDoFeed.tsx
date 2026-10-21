/**
 * A tela do feed dos clientes (/explorar, card #37): abas Produtos e Lojas,
 * pílulas de tipo de negócio, barra de busca/filtros/ordem e o conteúdo.
 * Recebe tudo pronto da página (que fala com a API) e só desenha.
 *
 * Card #49: a aba Produtos virou rede social — stories das lojas no topo e
 * uma coluna larga com um post (produto) por vez, rolagem infinita. As abas,
 * categorias e filtros ficam numa barra compacta grudada no topo. A aba Lojas
 * segue o mesmo jeito: uma loja por vez, como post.
 */
import Link from "next/link";
import type { LojaDoFeed, ProdutoDoFeed } from "@simpleclick/contracts";
import { Erro, IconeEstrela, Vazio } from "@simpleclick/ui";

import { BarraDoFeed } from "./BarraDoFeed.tsx";
import { CartaoDeLoja, CartaoDeProduto } from "./Cartoes.tsx";
import {
  categoriasDoFeed,
  enderecoDoFeed,
  totalDePaginas,
  type ConsultaDoFeed,
  type ListaDeLojas,
  type TipoDeNegocio,
} from "./consulta.ts";
import { FeedDeLojas } from "./FeedDeLojas.tsx";
import { FeedDePosts } from "./FeedDePosts.tsx";
import type { AcoesDoFeed, LojaComStories } from "./social.ts";
import { FileiraDeStories } from "./Stories.tsx";
import "./feed.css";

/** O que a página conseguiu buscar. */
export type ConteudoDoFeed =
  | {
      readonly estado: "produtos";
      readonly itens: readonly ProdutoDoFeed[];
      readonly total: number;
      readonly porPagina: number;
    }
  | {
      readonly estado: "lojas";
      readonly itens: readonly LojaDoFeed[];
      readonly total: number;
      readonly porPagina: number;
    }
  | { readonly estado: "precisa-entrar" }
  | { readonly estado: "indisponivel" };

const LISTAS: readonly { readonly valor: ListaDeLojas; readonly rotulo: string }[] = [
  { valor: "todas", rotulo: "Todas as lojas" },
  { valor: "favoritas", rotulo: "Favoritas" },
  { valor: "recentes", rotulo: "Vistas há pouco" },
];

export function TelaDoFeed({
  consulta,
  tipos,
  conteudo,
  logado,
  stories = [],
  seguidas = [],
  acoes,
}: {
  readonly consulta: ConsultaDoFeed;
  readonly tipos: readonly TipoDeNegocio[];
  readonly conteudo: ConteudoDoFeed;
  readonly logado: boolean;
  /** Lojas com story no ar (só na aba Produtos). */
  readonly stories?: readonly LojaComStories[];
  /** Apelidos das lojas que a pessoa segue. */
  readonly seguidas?: readonly string[];
  /** Sem ações (só em teste), ficam as grades de cartões do #37. */
  readonly acoes?: AcoesDoFeed;
}) {
  const aqui = enderecoDoFeed(consulta, { pagina: consulta.pagina });
  return (
    <main className="sc-feed" id="conteudo" data-aba={consulta.aba}>
      <div className="sc-feed__fixa">
        <header className="sc-feed__topo">
          <h1 className="sc-feed__titulo">Explorar</h1>
          <nav className="sc-feed__abas" aria-label="Explorar">
            {(["produtos", "lojas"] as const).map((aba) => (
              <Link
                key={aba}
                className="sc-feed__aba"
                href={enderecoDoFeed(consulta, { aba, lista: "todas" })}
                aria-current={consulta.aba === aba ? "page" : undefined}
              >
                {aba === "produtos" ? "Produtos" : "Lojas"}
              </Link>
            ))}
          </nav>
          <BarraDoFeed consulta={consulta} />
        </header>

        <nav className="sc-feed__categorias" aria-label="Tipos de negócio">
          {categoriasDoFeed(tipos).map((categoria) => (
            <Link
              key={categoria.rotulo}
              className="sc-feed__categoria"
              href={enderecoDoFeed(consulta, { tipo: categoria.tipo })}
              aria-current={consulta.tipo === categoria.tipo ? "true" : undefined}
            >
              {categoria.rotulo}
            </Link>
          ))}
        </nav>
      </div>

      {consulta.aba === "produtos" ? <FileiraDeStories lojas={stories} aoVerNaApi={acoes?.storyVisto} /> : null}

      {consulta.aba === "lojas" ? (
        <nav className="sc-feed__listas" aria-label="Quais lojas">
          {LISTAS.map((lista) => (
            <Link
              key={lista.valor}
              className="sc-feed__pilula"
              href={enderecoDoFeed(consulta, { lista: lista.valor })}
              aria-current={consulta.lista === lista.valor ? "true" : undefined}
            >
              {lista.valor === "favoritas" ? (
                <IconeEstrela
                  aria-hidden="true"
                  size={16}
                  preenchido={consulta.lista === "favoritas"}
                />
              ) : null}
              {lista.rotulo}
            </Link>
          ))}
        </nav>
      ) : null}

      {consulta.categoria ? (
        <p className="sc-feed__filtro-ativo">
          Categoria: <strong>{consulta.categoria}</strong>{" "}
          <Link href={enderecoDoFeed(consulta, { categoria: undefined })}>
            tirar filtro
          </Link>
        </p>
      ) : null}

      <Conteudo
        consulta={consulta}
        conteudo={conteudo}
        logado={logado}
        aqui={aqui}
        seguidas={seguidas}
        acoes={acoes}
      />
    </main>
  );
}

/** Os filtros do endereço como texto, para a próxima página vir igual. */
function parametrosDaConsulta(consulta: ConsultaDoFeed): Readonly<Record<string, string>> {
  const endereco = enderecoDoFeed(consulta);
  const busca = endereco.includes("?") ? endereco.slice(endereco.indexOf("?") + 1) : "";
  return Object.fromEntries(new URLSearchParams(busca));
}

function Conteudo({
  consulta,
  conteudo,
  logado,
  aqui,
  seguidas,
  acoes,
}: {
  readonly consulta: ConsultaDoFeed;
  readonly conteudo: ConteudoDoFeed;
  readonly logado: boolean;
  readonly aqui: string;
  readonly seguidas: readonly string[];
  readonly acoes: AcoesDoFeed | undefined;
}) {
  if (conteudo.estado === "indisponivel") {
    return (
      <Erro
        titulo="O feed não carregou"
        mensagem="Não conseguimos falar com as lojas agora. Tente de novo em instantes."
        acao={<Link href={aqui}>Tentar de novo</Link>}
      />
    );
  }
  if (conteudo.estado === "precisa-entrar") {
    return (
      <Vazio
        titulo={
          consulta.lista === "favoritas"
            ? "Entre para ver suas lojas favoritas"
            : "Entre para ver as lojas que você visitou"
        }
        descricao="Com a sua conta, o SimpleClick guarda as lojas que você marcou e as que abriu há pouco."
        acao={
          <Link className="sc-feed__chamada" href={`/entrar?proximo=${encodeURIComponent(aqui)}`}>
            Entrar
          </Link>
        }
      />
    );
  }

  const filtrando =
    consulta.tipo !== undefined ||
    consulta.entrega !== undefined ||
    consulta.busca !== undefined ||
    consulta.categoria !== undefined ||
    consulta.atacado === true;
  const limpar = (
    <Link
      className="sc-feed__chamada"
      href={enderecoDoFeed(consulta, {
        tipo: undefined,
        entrega: undefined,
        busca: undefined,
        categoria: undefined,
        atacado: false,
      })}
    >
      Limpar filtros
    </Link>
  );

  if (conteudo.itens.length === 0) {
    const vazioDaLista =
      consulta.lista === "favoritas"
        ? "Toque na estrela de uma loja para guardá-la aqui."
        : consulta.lista === "recentes"
          ? "As lojas que você abrir aparecem aqui."
          : undefined;
    return (
      <Vazio
        titulo={
          filtrando
            ? "Nada encontrado com esses filtros"
            : consulta.lista === "favoritas"
              ? "Nenhuma loja favorita ainda"
              : consulta.lista === "recentes"
                ? "Nenhuma loja vista ainda"
                : consulta.aba === "produtos"
                  ? "Nenhum produto no feed ainda"
                  : "Nenhuma loja no feed ainda"
        }
        descricao={
          filtrando
            ? "Tente outra busca ou tire algum filtro."
            : (vazioDaLista ?? "Assim que as lojas publicarem, tudo aparece aqui.")
        }
        acao={filtrando ? limpar : undefined}
      />
    );
  }

  if (conteudo.estado === "produtos") {
    // Sem as ações do servidor (só em teste), fica a grade simples do #37.
    if (acoes === undefined) {
      return (
        <ul className="sc-feed__grade sc-feed__grade--produtos">
          {conteudo.itens.map((produto, i) => (
            <CartaoDeProduto key={produto.id} produto={produto} consulta={consulta} prioridade={i < 4} />
          ))}
        </ul>
      );
    }
    return (
      <FeedDePosts
        inicial={conteudo.itens}
        total={conteudo.total}
        parametros={parametrosDaConsulta(consulta)}
        logado={logado}
        voltarPara={aqui}
        seguidas={seguidas}
        acoes={acoes}
      />
    );
  }

  // Lojas no mesmo jeito dos posts (card #49); sem as ações (só em teste),
  // a grade de cartões do #37 com paginação.
  if (acoes !== undefined) {
    return (
      <FeedDeLojas
        inicial={conteudo.itens}
        total={conteudo.total}
        parametros={parametrosDaConsulta(consulta)}
        paginada={consulta.lista === "todas"}
        logado={logado}
        voltarPara={aqui}
        acoes={acoes}
      />
    );
  }

  const paginas = totalDePaginas(conteudo.total, conteudo.porPagina);
  return (
    <>
      <p className="sc-feed__total" aria-live="polite">
        {conteudo.total === 1 ? "1 loja" : `${conteudo.total} lojas`}
      </p>
      <ul className="sc-feed__grade sc-feed__grade--lojas">
        {conteudo.itens.map((loja) => (
          <CartaoDeLoja key={loja.apelido} loja={loja} logado={logado} voltarPara={aqui} />
        ))}
      </ul>
      {paginas > 1 ? <Paginacao consulta={consulta} paginas={paginas} /> : null}
    </>
  );
}

export function Paginacao({
  consulta,
  paginas,
}: {
  readonly consulta: ConsultaDoFeed;
  readonly paginas: number;
}) {
  const atual = Math.min(consulta.pagina, paginas);
  return (
    <nav className="sc-feed__paginacao" aria-label="Páginas">
      {atual > 1 ? (
        <Link rel="prev" href={enderecoDoFeed(consulta, { pagina: atual - 1 })}>
          Anterior
        </Link>
      ) : (
        <span aria-disabled="true">Anterior</span>
      )}
      <span className="sc-feed__pagina">
        Página {atual} de {paginas}
      </span>
      {atual < paginas ? (
        <Link rel="next" href={enderecoDoFeed(consulta, { pagina: atual + 1 })}>
          Próxima
        </Link>
      ) : (
        <span aria-disabled="true">Próxima</span>
      )}
    </nav>
  );
}
