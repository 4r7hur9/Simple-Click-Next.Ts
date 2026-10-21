"use client";

/**
 * Uma seção do menu lateral: o título pequeno em caixa alta e a lista de
 * itens, todos visíveis. Nada abre nem fecha aqui.
 */
import { IconeAbrirFora } from "@simpleclick/ui";
import Link from "next/link";
import { useId } from "react";

import {
  classeDoItem,
  NOME_DO_ITEM,
  TITULO_DA_SECAO,
} from "./estilo-do-menu.ts";
import {
  itemEstaAtivo,
  type ItemDoMenu,
  type SecaoDoMenu as SecaoNoMenu,
} from "./tipos-do-menu.ts";

/** O selo com a contagem: ao lado do nome; na faixa de ícones, no canto do ícone. */
function ContadorDoItem({ quantos }: { readonly quantos: number }) {
  const texto = quantos > 99 ? "99+" : String(quantos);
  return (
    <>
      <span
        aria-hidden="true"
        className="ml-auto inline-flex min-w-6 items-center justify-center rounded-[var(--raio-completo)] bg-[var(--cor-primaria)] px-1.5 text-xs font-bold leading-6 text-[var(--cor-em-primaria)] group-aria-[current=page]:bg-[var(--cor-em-primaria)] group-aria-[current=page]:text-[var(--cor-primaria)] md:max-lg:absolute md:max-lg:top-1 md:max-lg:right-1 md:max-lg:ml-0 md:max-lg:min-w-5 md:max-lg:leading-5"
      >
        {texto}
      </span>
      <span className="sr-only">
        {quantos === 1 ? ", 1 novo" : `, ${quantos} novos`}
      </span>
    </>
  );
}

export function LinkDoMenu({
  item,
  caminho,
}: {
  readonly item: ItemDoMenu;
  readonly caminho: string | null;
}) {
  const ativo = itemEstaAtivo(caminho, item);
  const Desenho = item.icone;
  return (
    <Link
      href={item.href}
      aria-current={ativo ? "page" : undefined}
      className={classeDoItem(ativo)}
      {...(item.novaAba === true
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
    >
      <Desenho className="shrink-0" />
      <span className={NOME_DO_ITEM} data-nome-do-item>
        {item.rotulo}
      </span>
      {item.novaAba === true ? (
        <>
          <IconeAbrirFora
            className="ml-auto size-4 shrink-0 opacity-70 md:max-lg:hidden"
            aria-hidden="true"
          />
          <span className="sr-only">(abre em outra aba)</span>
        </>
      ) : null}
      {item.contador !== undefined && item.contador > 0 ? (
        <ContadorDoItem quantos={item.contador} />
      ) : null}
    </Link>
  );
}

export function SecaoDoMenu({
  secao,
  caminho,
}: {
  readonly secao: SecaoNoMenu;
  readonly caminho: string | null;
}) {
  const idDoTitulo = useId();
  return (
    <section
      {...(secao.titulo !== undefined ? { "aria-labelledby": idDoTitulo } : {})}
      className="flex flex-col gap-1 md:max-lg:border-t md:max-lg:border-[var(--cor-borda)] md:max-lg:pt-2 md:max-lg:first:border-t-0 md:max-lg:first:pt-0"
    >
      {secao.titulo !== undefined ? (
        <h2 id={idDoTitulo} className={TITULO_DA_SECAO}>
          {secao.titulo}
        </h2>
      ) : null}
      {secao.antes}
      <ul className="flex flex-col gap-1">
        {secao.itens.map((item) => (
          <li key={item.href}>
            <LinkDoMenu item={item} caminho={caminho} />
          </li>
        ))}
        {secao.depois !== undefined ? <li>{secao.depois}</li> : null}
      </ul>
    </section>
  );
}
