/**
 * Seções do Início que carregam sozinhas (card #106, T-10603): cada uma lê no
 * servidor, atrás de um Suspense, e falha sem derrubar as outras (AC-10605).
 */
import { Suspense, type ReactNode } from "react";

import { enderecoDoFeed, temLocal, type ConsultaDoFeed } from "../../../features/feed/consulta.ts";
import { Destaques, LojasPerto, SecaoCarregando, SuasLojas } from "../../../features/feed/SecoesDoInicio.tsx";
import { FileiraDeStories } from "../../../features/feed/Stories.tsx";
import {
  abaDeDestaques,
  dadosDeSuasLojas,
  destaquesDoInicio,
  lojasParaConhecer,
  ouReserva,
  storiesDoFeed,
} from "./_dados.ts";
import * as acoes from "./acoes.ts";

async function StoriesDoInicio({ token }: { readonly token: string | undefined }) {
  const { lojas } = await ouReserva(storiesDoFeed(token), { lojas: [], sessaoVencida: false });
  return <FileiraDeStories lojas={lojas} aoVerNaApi={acoes.storyVisto} />;
}

async function SuasLojasDoInicio({
  consulta,
  token,
  voltarPara,
}: {
  readonly consulta: ConsultaDoFeed;
  readonly token: string | undefined;
  readonly voltarPara: string;
}) {
  const dados = await ouReserva(dadosDeSuasLojas(token), { estado: "indisponivel" as const });
  const lojas = dados.estado === "ok" ? dados.lojas : [];
  // Sem lojas da conta, a seção mostra as lojas públicas para conhecer.
  const recomendadas =
    lojas.length > 0 ? [] : await ouReserva(lojasParaConhecer(consulta, token), []);
  return (
    <SuasLojas
      estado={dados.estado}
      lojas={lojas}
      recomendadas={recomendadas}
      logado={dados.estado === "ok"}
      voltarPara={voltarPara}
    />
  );
}

async function DestaquesDoInicio({
  consulta,
  destaques,
  token,
}: {
  readonly consulta: ConsultaDoFeed;
  readonly destaques: string | readonly string[] | undefined;
  readonly token: string | undefined;
}) {
  const aba = abaDeDestaques(destaques);
  const lido = await ouReserva(destaquesDoInicio(consulta, aba, token), {
    estado: "indisponivel" as const,
  });
  if (lido.estado !== "ok") {
    return (
      <p className="sc-inicio__vazio-secao" role="status">
        Não deu para carregar os destaques agora.{" "}
        <a className="sc-feed__chamada" href={enderecoDoFeed(consulta)}>
          Tentar de novo
        </a>
      </p>
    );
  }
  return (
    <Destaques
      aba={aba}
      produtos={lido.dados}
      consulta={consulta}
      enderecoDaAba={(a) => `${enderecoDoFeed(consulta)}${enderecoDoFeed(consulta).includes("?") ? "&" : "?"}destaques=${a}`}
    />
  );
}

/** Card #152: as lojas perto da região escolhida (ou as para conhecer). */
async function LojasPertoDoInicio({
  consulta,
  token,
  voltarPara,
}: {
  readonly consulta: ConsultaDoFeed;
  readonly token: string | undefined;
  readonly voltarPara: string;
}) {
  const lojas = await ouReserva(lojasParaConhecer(consulta, token), []);
  return (
    <LojasPerto
      lojas={lojas}
      comRegiao={temLocal(consulta)}
      logado={token !== undefined}
      voltarPara={voltarPara}
      verTodas={enderecoDoFeed(consulta, { aba: "lojas", inicio: false, lista: "todas" })}
    />
  );
}

/** As três seções, cada uma no seu Suspense. */
export function secoesDoInicio(
  consulta: ConsultaDoFeed,
  destaques: string | readonly string[] | undefined,
  token: string | undefined,
  voltarPara: string,
): {
  readonly stories: ReactNode;
  readonly suasLojas: ReactNode;
  readonly destaques: ReactNode;
} {
  // Card #152: a vitrine mista mostra as lojas perto, não "Suas lojas".
  const vitrine = consulta.inicio === true;
  return {
    stories: (
      <Suspense fallback={null}>
        <StoriesDoInicio token={token} />
      </Suspense>
    ),
    suasLojas: vitrine ? (
      <Suspense fallback={<SecaoCarregando rotulo="Carregando as lojas…" />}>
        <LojasPertoDoInicio consulta={consulta} token={token} voltarPara={voltarPara} />
      </Suspense>
    ) : (
      <Suspense fallback={null}>
        <SuasLojasDoInicio consulta={consulta} token={token} voltarPara={voltarPara} />
      </Suspense>
    ),
    destaques: (
      <Suspense fallback={<SecaoCarregando rotulo="Carregando os destaques…" />}>
        <DestaquesDoInicio consulta={consulta} destaques={destaques} token={token} />
      </Suspense>
    ),
  };
}
