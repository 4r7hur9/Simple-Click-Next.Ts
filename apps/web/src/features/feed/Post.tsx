"use client";

/**
 * Um post do feed (card #49): cada PRODUTO publicado no feed é um post da
 * loja. Topo com a foto de perfil e o nome da loja (levam à vitrine, o perfil
 * dela), há quanto tempo saiu e o botão de texto "Favoritar loja"; a mídia
 * em 4:5; a barra de ações (a estrela dela favorita o PRODUTO, só ela); o
 * nome, o preço e "Pedir", que abre o produto na loja.
 *
 * Ícones (regra do chefe): CURTIR é o brilho de 4 pontas do Simple (✦,
 * `IconeBrilho`), verde quando curtido; FAVORITAR é a estrela de 5 pontas
 * (`IconeEstrela`, no `BotaoFavoritar`). Coração, nunca.
 */
import Link from "next/link";
import { MessageCircle, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { iniciaisDaLoja, type ProdutoDoFeed } from "@simpleclick/contracts";
import { IconeBrilho } from "@simpleclick/ui";

import { chamadaDoAtacado } from "../../lib/atacado-na-vitrine.ts";
import { escreverDinheiro } from "../../lib/dinheiro.ts";
import { BotaoFavoritar } from "./BotaoFavoritar.tsx";
import { escreverDistancia } from "./consulta.ts";
import { MidiaDoPost } from "./MidiaDoPost.tsx";
import {
  escreverContagem,
  midiasDoProduto,
  socialDoProduto,
  tempoRelativo,
  type AcoesDoFeed,
} from "./social.ts";
import { comDestino } from "../../lib/destino-seguro.ts";

export function Post({
  produto,
  logado,
  voltarPara,
  acoes,
  seguindo,
  aoMudarSeguir,
  aoAbrirComentarios,
  prioridade = false,
}: {
  readonly produto: ProdutoDoFeed;
  readonly logado: boolean;
  readonly voltarPara: string;
  readonly acoes: AcoesDoFeed;
  readonly seguindo: boolean;
  readonly aoMudarSeguir: (apelido: string, seguindo: boolean) => void;
  readonly aoAbrirComentarios: (produto: ProdutoDoFeed) => void;
  readonly prioridade?: boolean;
}) {
  const social = socialDoProduto(produto);
  const [curtiu, setCurtiu] = useState(social.curtiu);
  const [curtidas, setCurtidas] = useState(social.curtidas);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [agora, setAgora] = useState<number | null>(null);
  const loja = produto.loja;
  const perfil = `/loja/${loja.apelido}`;
  // A foto de perfil da loja (#46: fotoDePerfil = logo); sem ela, as iniciais.
  const foto = loja.fotoDePerfil ?? loja.logo;
  const iniciais = loja.iniciais ?? iniciaisDaLoja(loja.nome);
  const pedir = `/loja/${loja.apelido}/produto/${produto.id}`;
  const entrar = comDestino("/entrar", voltarPara);
  const distancia = escreverDistancia(produto.distanciaKm);
  const temDesconto =
    produto.precoOriginalCentavos !== null &&
    produto.precoCentavos !== null &&
    produto.precoOriginalCentavos > produto.precoCentavos;
  // Varejo e atacado juntos (card #56); sem faixa, nada muda.
  const atacado =
    produto.precoCentavos === null ? null : chamadaDoAtacado(produto.atacado);

  // O "há 3 h" só no navegador: o servidor e a tela não brigam pelo relógio.
  useEffect(() => setAgora(Date.now()), []);

  useEffect(() => {
    if (aviso === null) return;
    const t = window.setTimeout(() => setAviso(null), 2_500);
    return () => window.clearTimeout(t);
  }, [aviso]);

  async function alternarCurtida(quer = !curtiu) {
    if (ocupado || quer === curtiu) return;
    setOcupado(true);
    setCurtiu(quer);
    setCurtidas((n) => Math.max(0, n + (quer ? 1 : -1)));
    const r = await acoes.curtir(produto.id, quer);
    if (r.ok) {
      setCurtiu(r.dados.curtiu);
      if (r.dados.curtidas !== null) setCurtidas(r.dados.curtidas);
    } else {
      setCurtiu(!quer);
      setCurtidas((n) => Math.max(0, n + (quer ? -1 : 1)));
      setAviso(
        r.motivo === "precisa-entrar"
          ? "Entre para curtir."
          : "Não deu para curtir agora. Tente de novo.",
      );
    }
    setOcupado(false);
  }

  async function compartilhar() {
    const url = new URL(pedir, window.location.origin).toString();
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: produto.nome,
          text: `${produto.nome} · ${loja.nome}`,
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      setAviso("Link copiado.");
    } catch {
      // A pessoa fechou o compartilhar: nada a fazer.
    }
  }

  return (
    <article
      className="sc-post"
      data-produto={produto.id}
      aria-label={`${produto.nome}, de ${loja.nome}`}
    >
      <header className="sc-post__topo">
        <Link
          className="sc-post__avatar"
          href={perfil}
          aria-hidden="true"
          tabIndex={-1}
        >
          {foto ? (
            <img src={foto} alt="" loading="lazy" />
          ) : (
            <span>{iniciais}</span>
          )}
        </Link>
        <div className="sc-post__quem">
          <Link className="sc-post__loja" href={perfil}>
            {loja.nome}
          </Link>
          <span className="sc-post__quando">
            {[
              agora === null ? null : tempoRelativo(produto.publicadoEm, agora),
              distancia,
              loja.bairro,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <BotaoFavoritar
          apelido={loja.apelido}
          nome={loja.nome}
          favorita={seguindo}
          logado={logado}
          voltarPara={voltarPara}
          variante="seguir"
          aoMudar={(sim) => aoMudarSeguir(loja.apelido, sim)}
        />
      </header>

      <MidiaDoPost
        midias={midiasDoProduto(produto)}
        nome={produto.nome}
        prioridade={prioridade}
        aoTocarDuasVezes={logado ? () => void alternarCurtida(true) : undefined}
      />

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
          <Link
            className="sc-post__acao"
            href={entrar}
            aria-label="Entre para curtir"
          >
            <IconeBrilho aria-hidden="true" size={28} />
          </Link>
        )}
        <button
          type="button"
          className="sc-post__acao"
          aria-label="Comentários"
          onClick={() => aoAbrirComentarios(produto)}
        >
          <MessageCircle aria-hidden="true" size={26} />
        </button>
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
          nome={produto.nome}
          favorita={social.favorito}
          logado={logado}
          voltarPara={voltarPara}
          variante="acao"
          alvo="produto"
          alternar={async (quer) =>
            (await acoes.favoritarProduto(produto.id, quer)).ok
          }
        />
      </div>

      {aviso === null ? null : (
        <p className="sc-post__aviso" role="status">
          {aviso}
        </p>
      )}

      <div className="sc-post__corpo">
        {curtidas > 0 ? (
          <p className="sc-post__curtidas">
            {escreverContagem(curtidas, "curtida", "curtidas")}
          </p>
        ) : null}
        <div className="sc-post__compra">
          <div className="sc-post__produto">
            <h2 className="sc-post__nome">{produto.nome}</h2>
            <p className="sc-post__preco">
              {produto.precoCentavos === null ? (
                "Ver opções"
              ) : (
                <>
                  {temDesconto ? (
                    <s className="sc-post__preco-de">
                      {escreverDinheiro(produto.precoOriginalCentavos ?? 0)}
                    </s>
                  ) : null}
                  {escreverDinheiro(produto.precoCentavos)}
                </>
              )}
            </p>
            {atacado === null ? null : (
              <p className="sc-post__atacado">{atacado}</p>
            )}
          </div>
          <Link className="sc-post__pedir" href={pedir}>
            Pedir
          </Link>
        </div>
        {produto.descricao ? (
          <p className="sc-post__descricao">{produto.descricao}</p>
        ) : null}
        <button
          type="button"
          className="sc-post__ver-comentarios"
          onClick={() => aoAbrirComentarios(produto)}
        >
          {social.comentarios > 0
            ? `Ver ${social.comentarios === 1 ? "o comentário" : `os ${escreverContagem(social.comentarios, "comentário", "comentários")}`}`
            : "Comentar"}
        </button>
      </div>
    </article>
  );
}

/** O post enquanto carrega: mesma forma, sem conteúdo. */
export function PostCarregando() {
  return (
    <div className="sc-post sc-post--carregando" aria-hidden="true">
      <div className="sc-post__topo">
        <span className="sc-post__avatar" />
        <span className="sc-post__traco" />
      </div>
      <div className="sc-post__midia" />
      <div className="sc-post__corpo">
        <span className="sc-post__traco sc-post__traco--longo" />
        <span className="sc-post__traco" />
      </div>
    </div>
  );
}
