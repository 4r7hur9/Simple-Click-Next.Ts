/**
 * O perfil público da loja, montado de dados JÁ PRONTOS (card #107).
 *
 * Existe separado da `TelaDaLoja` por um motivo prático: a tela busca dados e
 * é assíncrona, e um componente assíncrono não se desenha em
 * `renderToStaticMarkup`. Aqui tudo chega por propriedade, então a ordem dos
 * blocos e a omissão do que a loja não tem podem ser provadas em teste.
 *
 * COMPONENTE DE SERVIDOR, sem script: o conteúdo inteiro está no HTML. A
 * chave PIX nunca passa por aqui — o pagamento chega só como
 * `RecebimentoDaLoja` (critério legado 904).
 */
import "@simpleclick/ui/styles/vitrine.css";

import type { ProdutoDoFeed, Vitrine } from "@simpleclick/contracts";
import { Chip, FaixaDeChips } from "@simpleclick/ui";

import type { ProdutoNaTela } from "../../lib/catalogo.ts";
import { Destaques } from "../vitrine/Destaques.tsx";

import { ApresentacaoDaLoja } from "./ApresentacaoDaLoja.tsx";
import { ContatoDaLoja } from "./ContatoDaLoja.tsx";
import { EntradaDaLoja } from "./EntradaDaLoja.tsx";
import { PublicacoesDaLoja } from "./PublicacoesDaLoja.tsx";
import { SobreDaLoja, type RecebimentoDaLoja } from "./SobreDaLoja.tsx";

export interface PerfilDaLojaProps {
  readonly loja: Vitrine["loja"];
  readonly abertura: Vitrine["abertura"];
  readonly horario: Vitrine["horario"] | null;
  /** Pagamento e entrega, SEM a chave PIX; nulo se o fechamento não respondeu. */
  readonly recebimento: RecebimentoDaLoja | null;
  /** Os produtos que a loja marcou como destaque, já preparados para a tela. */
  readonly destaques?: readonly ProdutoNaTela[] | undefined;
  /** Os produtos à venda, já como posts (a vitrine mostra até seis). */
  readonly posts: readonly ProdutoDoFeed[];
  readonly logado: boolean;
  readonly favorita: boolean;
  /** Nasce aberto: é a rota `/sobre`. */
  readonly sobreAberto: boolean;
  /** Itens à venda, quando o número é exato (`contagemExataDeItens`). */
  readonly contagemDeItens?: number | null | undefined;
}

export function PerfilDaLoja({
  loja,
  abertura,
  horario,
  recebimento,
  destaques = [],
  posts,
  logado,
  favorita,
  sobreAberto,
  contagemDeItens = null,
}: PerfilDaLojaProps) {
  return (
    <>
      <ApresentacaoDaLoja
        loja={loja}
        abertura={abertura}
        linkDoCardapio={`/loja/${loja.apelido}/cardapio`}
        rotuloDoCatalogo={loja.rotulos.catalogo}
        contagemDeItens={contagemDeItens}
        favoritar={{ logado, favorita }}
        whatsappPublico={loja.whatsappPublico ?? null}
        compartilhar
        recebimento={recebimento}
      />

      {/*
        A FAIXA É DE LINKS, e não de abas: cada seção já está inteira no HTML,
        empilhada, e o chip só leva até ela. Sem JavaScript tudo continua ali.
        O Sobre é a janela com endereço próprio (`/sobre`).
      */}
      <FaixaDeChips
        navegacao
        rotulo={`Seções de ${loja.nome}`}
        className="sc-loja__chips"
      >
        {destaques.length > 0 ? <Chip href="#destaques">Destaques</Chip> : null}
        {posts.length > 0 ? <Chip href="#publicacoes">Publicações</Chip> : null}
        <Chip href={`/loja/${loja.apelido}/sobre`}>
          Sobre a loja e horários
        </Chip>
      </FaixaDeChips>

      {destaques.length > 0 ? (
        <div className="sc-loja__destaques">
          <Destaques destaques={destaques} formato="grade" />
        </div>
      ) : null}

      {posts.length > 0 ? (
        <div id="publicacoes" className="sc-loja__publicacoes">
          <PublicacoesDaLoja
            apelido={loja.apelido}
            produtos={posts}
            linkDeTodas={`/loja/${loja.apelido}/cardapio`}
          />
        </div>
      ) : null}

      <ContatoDaLoja
        nome={loja.nome}
        whatsappPublico={loja.whatsappPublico ?? null}
      />

      <SobreDaLoja
        loja={loja}
        abertura={abertura}
        horario={horario ?? null}
        recebimento={recebimento}
        rotuloDoCatalogo={loja.rotulos.catalogo}
        aberta={sobreAberto}
      />
      {/*
        A entrada vem DEPOIS do conteúdo, e não em volta dele. Ela não desenha
        nada: acha os blocos que já estão na página e os anima. Se nunca rodar,
        a página continua inteira.
      */}
      <EntradaDaLoja />
    </>
  );
}
