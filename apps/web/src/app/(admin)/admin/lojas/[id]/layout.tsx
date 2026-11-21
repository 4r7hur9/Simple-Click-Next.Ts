/**
 * A moldura da ficha de uma loja (card #29): o cabeçalho com a situação e a
 * ação da hora, e as abas. Cada aba é uma página dentro dela.
 *
 * A ficha é buscada uma vez, pelo provedor, e repartida entre o cabeçalho e
 * as abas — assim abrir a ficha deixa um registro só na trilha (AC-118). Quem
 * decide se a pessoa pode ver a ficha é a API, com a credencial própria da
 * administração.
 */
import type { ReactNode } from "react";

import { AbasDaLoja } from "../../../../../features/admin/AbasDaLoja.tsx";
import { CabecalhoDaFicha } from "../../../../../features/admin/CabecalhoDaFicha.tsx";
import { ProvedorDaFicha } from "../../../../../features/admin/ProvedorDaFicha.tsx";
import { exigirAdministracaoDaPlataforma } from "../../../../../server/acesso-da-administracao.ts";

interface ParametrosDoLayout {
  readonly children: ReactNode;
  readonly params: Promise<{ readonly id: string }>;
}

export default async function LayoutDaFicha({
  children,
  params,
}: ParametrosDoLayout) {
  const { id } = await params;
  await exigirAdministracaoDaPlataforma(
    `/admin/lojas/${encodeURIComponent(id)}`,
  );
  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-12 sm:px-8 sm:pt-10 sm:pb-16">
      <ProvedorDaFicha lojaId={id}>
        <CabecalhoDaFicha />
        <AbasDaLoja lojaId={id} />
        <div className="mt-8">{children}</div>
      </ProvedorDaFicha>
    </div>
  );
}
