"use client";

/**
 * O menu do painel da loja: junta o que a sessão sabe (loja, papel, quem está
 * logado) com a lista de seções (`secoes-do-painel.ts`) e entrega ao
 * `MenuLateral`.
 *
 * Mora no cliente porque os ícones são componentes, e componente não atravessa
 * a fronteira servidor → cliente como propriedade. O layout manda só dados: a
 * loja, o papel nela, as permissões e a pessoa. O menu mostra só o que o papel
 * pode usar; quem barra de verdade é a API, e as páginas têm a própria guarda.
 *
 * Duas coisas vêm do navegador depois que a tela abre: a impressão
 * automática, que a administração pode desligar para a loja, e o número de
 * pedidos novos no selo de "Pedidos".
 */

import { SECOES_DO_DONO, type SecaoDoDono } from "@simpleclick/contracts";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";

import { pode, type PermissaoDaLoja } from "../../lib/permissoes.ts";
import { useNavegacaoDaConfiguracao } from "../config/NavegacaoDaConfiguracao.tsx";
import {
  CabecalhoCompactoDaLoja,
  CabecalhoDaLoja,
} from "./CabecalhoDaLoja.tsx";
import { MenuLateral } from "./MenuLateral.tsx";
import { PessoaDoMenu } from "./PessoaDoMenu.tsx";
import { SairDoMenu } from "./SairDoMenu.tsx";
import { useComentariosPendentes } from "../comentarios/useComentariosPendentes.ts";
import { atalhosDoPainel, secoesDoPainel } from "./secoes-do-painel.ts";
import { usePedidosNovos } from "./usePedidosNovos.ts";

export interface PessoaLogada {
  readonly nome: string;
  readonly email: string;
  readonly iniciais: string;
}

export function MenuDoPainel({
  nomeDaLoja,
  apelidoDaLoja,
  papel,
  permissoes,
  temOutrasLojas,
  pessoa,
  sair,
}: {
  readonly nomeDaLoja: string;
  readonly apelidoDaLoja: string;
  /** O papel da pessoa nesta loja: `OWNER` ou `STAFF`. */
  readonly papel: string;
  /** O que a pessoa pode nesta loja (de `GET /v1/eu`). */
  readonly permissoes: readonly PermissaoDaLoja[];
  readonly temOutrasLojas: boolean;
  /** Quem está logado; sem isso a seção Conta não mostra o nome. */
  readonly pessoa?: PessoaLogada | undefined;
  /** A ação de encerrar a sessão, montada pelo layout. */
  readonly sair: (caminho: string) => Promise<void>;
}) {
  const configuracoesVisiveis = useNavegacaoDaConfiguracao();
  const conjunto = useMemo(() => new Set(permissoes), [permissoes]);
  const pedidosNovos = usePedidosNovos(pode(conjunto, "pedidos.operar"));
  const comentariosPendentes = useComentariosPendentes(
    pode(conjunto, "moderar_comentarios"),
  );

  const secoesDesligadas = useMemo(() => {
    const visiveis = new Set(configuracoesVisiveis.map((item) => item.secao));
    return new Set<SecaoDoDono>(
      SECOES_DO_DONO.filter((secao) => !visiveis.has(secao)),
    );
  }, [configuracoesVisiveis]);

  const secoes = useMemo(
    () =>
      secoesDoPainel({
        apelidoDaLoja,
        permissoes: conjunto,
        temOutrasLojas,
        secoesDesligadas,
        pedidosNovos,
        comentariosPendentes,
        pessoa: pessoa === undefined ? undefined : <PessoaDoMenu {...pessoa} />,
        sair: <SairDoMenu sair={sair} />,
      }),
    [
      apelidoDaLoja,
      conjunto,
      temOutrasLojas,
      secoesDesligadas,
      pedidosNovos,
      comentariosPendentes,
      pessoa,
      sair,
    ],
  );

  const marca: ReactNode = (
    <Link
      href="/painel"
      className="font-[family-name:var(--fonte-titulo)] text-xl font-semibold tracking-[-0.04em] text-[var(--cor-tinta)]"
    >
      simpleclick
    </Link>
  );

  return (
    <MenuLateral
      rotulo="Navegação do painel"
      marca={marca}
      contexto={
        <CabecalhoDaLoja
          nomeDaLoja={nomeDaLoja}
          papel={papel}
          temOutrasLojas={temOutrasLojas}
        />
      }
      contextoDoTopo={
        <CabecalhoCompactoDaLoja nomeDaLoja={nomeDaLoja} papel={papel} />
      }
      secoes={secoes}
      atalhos={atalhosDoPainel(secoes)}
      botaoDoMenuNosAtalhos
    />
  );
}
