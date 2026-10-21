/**
 * A guarda de uma área do painel, no SERVIDOR: se o papel da pessoa na loja
 * não tem a permissão da área, a página nem é montada e a pessoa vê a tela
 * "Sem permissão". Entra num `layout.tsx` da área, então vale para todas as
 * páginas dela, inclusive as que ainda vão nascer.
 *
 * Mora em `app/` porque é quem pode falar com `server/` (a loja da sessão).
 * A regra de quem pode o quê é `lib/permissoes.ts`; a API continua impondo
 * cada rota — esta guarda só evita mostrar uma tela que a API recusaria.
 */
import type { ReactNode } from "react";

import { SemPermissao } from "../../features/painel/SemPermissao.tsx";
import {
  pode,
  permissoesDaLoja,
  type PermissaoDaLoja,
} from "../../lib/permissoes.ts";
import { exigirLojaDaPagina } from "../../server/loja-da-pagina.ts";

export async function GuardaDoPainel({
  permissao,
  children,
}: Readonly<{ permissao: PermissaoDaLoja; children: ReactNode }>) {
  const { loja } = await exigirLojaDaPagina();
  const permissoes = permissoesDaLoja(loja);
  if (pode(permissoes, permissao)) return <>{children}</>;
  return (
    <SemPermissao
      permissao={permissao}
      papel={loja.papel}
      nomeDaLoja={loja.nome}
      inicioPermitido={pode(permissoes, "metricas")}
    />
  );
}
