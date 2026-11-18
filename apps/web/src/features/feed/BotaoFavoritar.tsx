"use client";

/**
 * O favoritar do feed: a estrela de 5 pontas (`IconeEstrela`), regra do
 * chefe — nunca coração; o brilho de 4 pontas (`IconeBrilho`) é o CURTIR.
 * Com conta, marca e desmarca na hora (e volta atrás se a API recusar); sem
 * conta, leva a entrar e voltar aqui. Textos: "Favoritar" / "Favorito".
 *
 * Três jeitos (card #49): `cartao` (o redondo no canto do cartão da loja),
 * `seguir` (o botão SÓ DE TEXTO "Favoritar loja" no topo do post de produto:
 * sem estrela, para nunca haver duas estrelas iguais no mesmo post) e `acao`
 * (a estrela da barra de ações: no post de produto favorita o PRODUTO; no
 * post de loja, a loja). Por padrão favorita a loja; `alternar` troca o alvo.
 * Os nomes acessíveis dizem o alvo: "Favoritar produto X" / "Favoritar loja Y".
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { IconeEstrela } from "@simpleclick/ui";
import { comDestino } from "../../lib/destino-seguro.ts";

export type VarianteDoFavoritar = "cartao" | "seguir" | "acao";

export function BotaoFavoritar({
  apelido,
  nome,
  favorita: inicial,
  logado,
  voltarPara,
  variante = "cartao",
  alvo = "loja",
  alternar: alternarFora,
  aoMudar,
  buscar = fetch,
}: {
  readonly apelido: string;
  readonly nome: string;
  readonly favorita: boolean;
  readonly logado: boolean;
  /** Para onde voltar depois de entrar. */
  readonly voltarPara: string;
  readonly variante?: VarianteDoFavoritar;
  /** O que é favoritado, para os textos ("Favoritar produto X"). */
  readonly alvo?: "loja" | "produto";
  /** Troca o alvo: devolve se deu certo. Sem ela, favorita a loja `apelido`. */
  readonly alternar?: (quer: boolean) => Promise<boolean>;
  /** Avisa quem está em volta (outros posts da mesma loja). */
  readonly aoMudar?: (favorita: boolean) => void;
  readonly buscar?: typeof fetch;
}) {
  const [favorita, setFavorita] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);
  const [falhou, setFalhou] = useState(false);

  // Outro post da mesma loja mudou: acompanha.
  useEffect(() => setFavorita(inicial), [inicial]);

  const classe = `sc-feed__favoritar sc-feed__favoritar--${variante}`;
  const seguir = variante === "seguir";
  // O botão de texto da loja não leva estrela (a estrela do post é do produto).
  const rotuloDoTexto = seguir
    ? favorita
      ? "Loja favorita"
      : "Favoritar loja"
    : null;
  const estrela = seguir ? null : (
    <IconeEstrela
      aria-hidden="true"
      size={22}
      preenchido={logado && favorita}
    />
  );

  if (!logado) {
    return (
      <Link
        className={classe}
        href={comDestino("/entrar", voltarPara)}
        aria-label={`Entre para favoritar ${alvo} ${nome}`}
        title={`Entre para favoritar ${alvo === "loja" ? "a loja" : "o produto"}`}
      >
        {estrela}
        {rotuloDoTexto === null ? null : <span>{rotuloDoTexto}</span>}
      </Link>
    );
  }

  async function padrao(quer: boolean): Promise<boolean> {
    const resposta = await buscar(
      `/api/conta/favoritos/${encodeURIComponent(apelido)}`,
      {
        method: quer ? "POST" : "DELETE",
      },
    );
    return resposta.ok;
  }

  async function alternar() {
    const quer = !favorita;
    setOcupado(true);
    setFalhou(false);
    setFavorita(quer);
    try {
      const deu = await (alternarFora ?? padrao)(quer);
      if (!deu) throw new Error("recusado");
      aoMudar?.(quer);
    } catch {
      setFavorita(!quer);
      setFalhou(true);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <button
      type="button"
      className={classe}
      aria-pressed={favorita}
      aria-label={
        favorita ? `Favorito: ${alvo} ${nome}` : `Favoritar ${alvo} ${nome}`
      }
      title={
        falhou
          ? "Não deu certo agora. Tente de novo."
          : favorita
            ? `${alvo === "loja" ? "Loja favorita" : "Produto favorito"} (toque para tirar)`
            : `Favoritar ${alvo === "loja" ? "a loja" : "o produto"}`
      }
      data-falhou={falhou || undefined}
      disabled={ocupado}
      onClick={() => void alternar()}
    >
      {estrela}
      {rotuloDoTexto === null ? null : <span>{rotuloDoTexto}</span>}
    </button>
  );
}
