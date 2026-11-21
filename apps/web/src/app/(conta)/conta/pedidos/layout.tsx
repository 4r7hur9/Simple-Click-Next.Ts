import type { ReactNode } from "react";

import { desviarAdministradorDasAreasDeCliente } from "../../../../server/area-do-papel.ts";

/**
 * A guarda de Meus pedidos ACIMA do `loading.tsx` (card #170, T-6).
 *
 * `redirect()` dentro de uma página que tem `loading.tsx` não vira resposta
 * 307: o esqueleto já foi enviado, e o desvio só chega depois, pelo fluxo de
 * renderização, para o navegador cumprir. Aqui, no layout (que fica acima da
 * fronteira de carregamento), o administrador confirmado é levado para `/admin`
 * pelo servidor, antes de qualquer byte da tela e também nos pedidos de
 * detalhe (`/conta/pedidos/<id>`). A página repete a guarda, porque a
 * navegação parcial do App Router pode não reexecutar o layout; a pergunta à
 * API é uma só por pedido.
 */
export default async function LayoutDeMeusPedidos({
  children,
}: Readonly<{ children: ReactNode }>) {
  await desviarAdministradorDasAreasDeCliente();
  return <>{children}</>;
}
