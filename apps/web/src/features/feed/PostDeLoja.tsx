"use client";

/**
 * A loja como post (aba Lojas do /explorar, card #49): o mesmo jeito do post
 * de produto. Topo com a foto de perfil e o nome; a mídia 4:5 é a capa da loja
 * (sem capa, o desenho padrão do ramo com a foto de perfil no meio); a barra
 * com curtir (brilho), compartilhar e a estrela, que aqui é da LOJA (uma só
 * por post: o topo não repete o favoritar); embaixo, ramo,
 * local, distância, como receber, quantos produtos e "Ver loja".
 */
import Link from "next/link";
import { Send } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { iniciaisDaLoja, type LojaDoFeed } from "@simpleclick/contracts";
import { IconeBrilho, IconeEntrega, IconeLocal } from "@simpleclick/ui";

import { capaPadraoDe } from "../../lib/capa-padrao.ts";
import { BotaoFavoritar } from "./BotaoFavoritar.tsx";
import { escreverDistancia, escreverFormas } from "./consulta.ts";
import { escreverContagem, socialDoProduto, type AcoesDoFeed } from "./social.ts";

export function PostDeLoja({
  loja,
  logado,
  voltarPara,
  acoes,
  favorita,
  aoMudarFavorita,
  prioridade = false,
}: {
  readonly loja: LojaDoFeed;
  readonly logado: boolean;
  readonly voltarPara: string;
  readonly acoes: AcoesDoFeed;
  readonly favorita: boolean;
  readonly aoMudarFavorita: (apelido: string, favorita: boolean) => void;
  readonly prioridade?: boolean;
}) {
  const social = socialDoProduto(loja);
  const [curtiu, setCurtiu] = useState(social.curtiu);
  const [curtidas, setCurtidas] = useState(social.curtidas);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const perfil = `/loja/${loja.apelido}`;
  const entrar = `/entrar?proximo=${encodeURIComponent(voltarPara)}`;
  const foto = loja.fotoDePerfil ?? loja.logo;
  const iniciais = loja.iniciais ?? iniciaisDaLoja(loja.nome);
  const distancia = escreverDistancia(loja.distanciaKm);
  const formas = escreverFormas(loja.formasDeEntrega);
  const local = [loja.bairro, loja.cidade].filter(Boolean).join(", ");
  const descricao = textoDaLoja(loja);

  useEffect(() => {
    if (aviso === null) return;
    const t = window.setTimeout(() => setAviso(null), 2_500);
    return () => window.clearTimeout(t);
  }, [aviso]);

  async function alternarCurtida() {
    if (ocupado) return;
    const quer = !curtiu;
    setOcupado(true);
    setCurtiu(quer);
    setCurtidas((n) => Math.max(0, n + (quer ? 1 : -1)));
    const r = acoes.curtirLoja
      ? await acoes.curtirLoja(loja.apelido, quer)
      : ({ ok: false, motivo: "indisponivel" } as const);
    if (r.ok) {
      setCurtiu(r.dados.curtiu);
      if (r.dados.curtidas !== null) setCurtidas(r.dados.curtidas);
    } else {
      setCurtiu(!quer);
      setCurtidas((n) => Math.max(0, n + (quer ? -1 : 1)));
      setAviso(r.motivo === "precisa-entrar" ? "Entre para curtir." : "Não deu para curtir agora. Tente de novo.");
    }
    setOcupado(false);
  }

  async function compartilhar() {
    const url = new URL(perfil, window.location.origin).toString();
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: loja.nome, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setAviso("Link copiado.");
    } catch {
      // A pessoa fechou o compartilhar: nada a fazer.
    }
  }

  return (
    <article className="sc-post sc-post--loja" data-loja={loja.apelido} aria-label={loja.nome}>
      <header className="sc-post__topo">
        <Link className="sc-post__avatar" href={perfil} aria-hidden="true" tabIndex={-1}>
          {foto ? <img src={foto} alt="" loading="lazy" /> : <span>{iniciais}</span>}
        </Link>
        <div className="sc-post__quem">
          <Link className="sc-post__loja" href={perfil}>
            {loja.nome}
          </Link>
          <span className="sc-post__quando">
            {[loja.tipoDeNegocioNome, distancia].filter(Boolean).join(" · ")}
          </span>
        </div>
      </header>

      <Link
        className="sc-post__midia sc-post__midia--loja"
        href={perfil}
        aria-label={`Abrir ${loja.nome}`}
        style={{ "--capa-url": `url("${loja.capa ?? capaPadraoDe(loja.tipoDeNegocio)}")` } as CSSProperties}
        data-capa-propria={loja.capa ? "" : undefined}
      >
        {loja.capa ? (
          <img src={loja.capa} alt="" loading={prioridade ? "eager" : "lazy"} />
        ) : (
          <span className="sc-post__perfil-grande" aria-hidden="true">
            {foto ? <img src={foto} alt="" loading="lazy" /> : <span>{iniciais}</span>}
          </span>
        )}
      </Link>

      <div className="sc-post__acoes">
        {logado ? (
          <button
            type="button"
            className="sc-post__acao sc-post__acao--curtir"
            aria-pressed={curtiu}
            aria-label={curtiu ? "Curtido" : "Curtir"}
            title={curtiu ? "Curtido (toque para desfazer)" : "Curtir"}
            onClick={() => void alternarCurtida()}
          >
            <IconeBrilho aria-hidden="true" size={28} preenchido={curtiu} />
          </button>
        ) : (
          <Link className="sc-post__acao" href={entrar} aria-label="Entre para curtir">
            <IconeBrilho aria-hidden="true" size={28} />
          </Link>
        )}
        <button
          type="button"
          className="sc-post__acao"
          aria-label="Compartilhar"
          onClick={() => void compartilhar()}
        >
          <Send aria-hidden="true" size={24} />
        </button>
        <span className="sc-post__espaco" />
        <BotaoFavoritar
          apelido={loja.apelido}
          nome={loja.nome}
          favorita={favorita}
          logado={logado}
          voltarPara={voltarPara}
          variante="acao"
          aoMudar={(sim) => aoMudarFavorita(loja.apelido, sim)}
        />
      </div>

      {aviso === null ? null : (
        <p className="sc-post__aviso" role="status">
          {aviso}
        </p>
      )}

      <div className="sc-post__corpo">
        {curtidas > 0 ? (
          <p className="sc-post__curtidas">{escreverContagem(curtidas, "curtida", "curtidas")}</p>
        ) : null}
        <div className="sc-post__compra">
          <div className="sc-post__produto">
            <h2 className="sc-post__nome">{loja.nome}</h2>
            <p className="sc-post__tipo">{loja.tipoDeNegocioNome}</p>
          </div>
          <Link className="sc-post__pedir" href={perfil}>
            Ver loja
          </Link>
        </div>
        {descricao ? <p className="sc-post__descricao">{descricao}</p> : null}
        <ul className="sc-post__fatos">
          {local !== "" || distancia !== null ? (
            <li>
              <IconeLocal aria-hidden="true" size={16} />
              {[distancia, local].filter(Boolean).join(" · ")}
            </li>
          ) : null}
          {formas === null ? null : (
            <li>
              <IconeEntrega aria-hidden="true" size={16} />
              {formas}
            </li>
          )}
          {loja.produtosNoFeed > 0 ? (
            <li className="sc-post__fato-destaque">
              {loja.produtosNoFeed === 1 ? "1 produto em destaque" : `${loja.produtosNoFeed} produtos em destaque`}
            </li>
          ) : null}
        </ul>
      </div>
    </article>
  );
}

/** A descrição da loja, se a API mandar (a lista do feed ainda não manda). */
function textoDaLoja(loja: LojaDoFeed): string | null {
  const b = loja as unknown as Record<string, unknown>;
  for (const campo of ["descricao", "boasVindas", "sobre"]) {
    const valor = b[campo];
    if (typeof valor === "string" && valor.trim() !== "") return valor.trim();
  }
  return null;
}
