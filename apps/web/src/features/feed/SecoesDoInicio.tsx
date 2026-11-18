/**
 * As seções do Início (card #106, composição do Stitch no card #128): as
 * lojas (as da conta ou, sem elas, as lojas para conhecer) e "Destaques e
 * ofertas". Só desenham o que a página trouxe; cada uma falha e some sozinha
 * (AC-10605).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import type { LojaDoFeed, ProdutoDoFeed } from "@simpleclick/contracts";
import { Chip, FaixaDeChips, IconeAvancar } from "@simpleclick/ui";

import { comDestino } from "../../lib/destino-seguro.ts";
import { CartaoDeLoja, CartaoDeProduto } from "./Cartoes.tsx";
import type { ConsultaDoFeed } from "./consulta.ts";

export type EstadoDeSuasLojas =
  "visitante" | "sessao-vencida" | "indisponivel" | "ok";

/** O cabeçalho das seções: sobretítulo verde, título e o "ver tudo". */
export function CabecaDaSecao({
  id,
  sobretitulo,
  titulo,
  verTudo,
  extra,
}: {
  readonly id: string;
  readonly sobretitulo: string;
  readonly titulo: ReactNode;
  readonly verTudo?: { readonly href: string; readonly rotulo: string } | undefined;
  readonly extra?: ReactNode;
}) {
  return (
    <header className="sc-inicio__cabeca">
      <div className="sc-inicio__titulos">
        <p className="sc-inicio__sobretitulo">{sobretitulo}</p>
        <h2 id={id} className="sc-inicio__titulo">
          {titulo}
        </h2>
      </div>
      {extra}
      {verTudo ? (
        <Link className="sc-inicio__ver-tudo" href={verTudo.href}>
          {verTudo.rotulo}
          <IconeAvancar aria-hidden="true" size={16} />
        </Link>
      ) : null}
    </header>
  );
}

export function SuasLojas({
  estado,
  lojas,
  voltarPara,
  recomendadas = [],
  logado = estado === "ok",
}: {
  readonly estado: EstadoDeSuasLojas;
  readonly lojas: readonly LojaDoFeed[];
  readonly voltarPara: string;
  /** Lojas públicas, para quando a conta não tem nenhuma (card #128). */
  readonly recomendadas?: readonly LojaDoFeed[];
  readonly logado?: boolean;
}) {
  const daConta = estado === "ok" && lojas.length > 0;
  const convite =
    estado === "visitante"
      ? "Entre para ver as lojas que você favoritou e as que visitou."
      : estado === "sessao-vencida"
        ? "Sua sessão venceu. Entre de novo para ver suas lojas."
        : null;
  const lista = daConta ? lojas : recomendadas;
  if (convite === null && lista.length === 0) return null;
  return (
    <section className="sc-inicio__secao" aria-labelledby="sc-suas-lojas">
      <CabecaDaSecao
        id="sc-suas-lojas"
        sobretitulo={
          daConta ? "Favoritas e vistas há pouco" : "Lojas do SimpleClick"
        }
        titulo={daConta ? "Suas lojas" : "Lojas para conhecer"}
        verTudo={
          lista.length > 0
            ? {
                href: daConta
                  ? "/explorar/lojas?lista=favoritas"
                  : "/explorar/lojas",
                rotulo: "Ver todas",
              }
            : undefined
        }
      />
      {convite === null ? null : (
        <p className="sc-inicio__convite">
          {convite}{" "}
          <Link
            className="sc-feed__chamada"
            href={comDestino("/entrar", voltarPara)}
          >
            Entrar
          </Link>
        </p>
      )}
      {lista.length === 0 ? null : (
        <ul className="sc-inicio__lojas">
          {lista.map((loja) => (
            <CartaoDeLoja
              key={loja.apelido}
              loja={loja}
              logado={logado}
              voltarPara={voltarPara}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function Destaques({
  aba,
  produtos,
  consulta,
  enderecoDaAba,
}: {
  readonly aba: "recentes" | "atacado";
  readonly produtos: readonly ProdutoDoFeed[];
  readonly consulta: ConsultaDoFeed;
  readonly enderecoDaAba: (aba: "recentes" | "atacado") => string;
}) {
  return (
    <section className="sc-inicio__secao" aria-labelledby="sc-destaques">
      <CabecaDaSecao
        id="sc-destaques"
        sobretitulo="Preço publicado pela loja"
        titulo="Destaques e ofertas"
        extra={
          <FaixaDeChips
            rotulo="Destaques"
            navegacao
            className="sc-inicio__abas"
          >
            {(["recentes", "atacado"] as const).map((a) => (
              <Chip
                key={a}
                componenteDeLink={Link}
                href={enderecoDaAba(a)}
                ativo={aba === a}
              >
                {a === "recentes" ? "Recentes" : "Atacado"}
              </Chip>
            ))}
          </FaixaDeChips>
        }
        verTudo={{
          href:
            aba === "atacado"
              ? "/explorar/produtos?atacado=1"
              : "/explorar/produtos?ordem=recentes",
          rotulo: "Ver tudo",
        }}
      />
      {produtos.length === 0 ? (
        <p className="sc-inicio__vazio">
          {aba === "atacado"
            ? "Nenhuma loja publicou preço de atacado ainda."
            : "As lojas ainda não publicaram produtos."}{" "}
          <Link className="sc-feed__chamada" href="/explorar/lojas">
            Ver as lojas
          </Link>
        </p>
      ) : (
        <ul className="sc-inicio__produtos">
          {produtos.map((produto, i) => (
            <CartaoDeProduto
              key={produto.id}
              produto={produto}
              consulta={consulta}
              prioridade={i < 2}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
