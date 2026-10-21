/**
 * O rótulo de um campo escrito à mão com o "i" ao lado (card #68).
 *
 * As telas de configuração montam o rótulo sem o `Campo` de `@simpleclick/ui`.
 * Aqui o `<label>` e o `<Info>` ficam lado a lado, irmãos, como pede a regra
 * "Campos explicados": o botão do "i" nunca entra no `<label>` (clicar nele
 * marcaria a caixa ou focaria o campo) nem fica por cima do controle.
 *
 * O texto escondido do "i" ganha o `id` `{para}-info`; o controle o liga com
 * {@link descritores}.
 */
import { Info, idDoTextoDoInfo } from "@simpleclick/ui";
import type { ReactNode } from "react";

import { EXPLICACOES, type NomeDaExplicacao } from "./explicacoes-do-painel.ts";

/** O "i" de uma explicação do painel, com o nome do que ele explica. */
export function InfoDoPainel({
  explicacao,
  nome,
  id,
}: {
  readonly explicacao: NomeDaExplicacao;
  /** Vira "Saiba mais sobre {nome}". */
  readonly nome: string;
  readonly id?: string | undefined;
}) {
  return <Info rotulo={nome} conteudo={EXPLICACOES[explicacao]} id={id} />;
}

export function RotuloComInfo({
  para,
  explicacao,
  nome,
  children,
  className = "",
}: {
  /** O `id` do controle. */
  readonly para: string;
  readonly explicacao: NomeDaExplicacao;
  /** O nome do campo para o leitor de tela; padrão: o próprio rótulo. */
  readonly nome: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <span className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <label htmlFor={para}>{children}</label>
      <InfoDoPainel explicacao={explicacao} nome={nome} id={para} />
    </span>
  );
}

/** O `id` do texto do "i" de um controle. */
export function idDoInfo(para: string): string {
  return idDoTextoDoInfo(para);
}

/** Junta os `id` de `aria-describedby`, sem os vazios. */
export function descritores(
  ...ids: readonly (string | undefined | false)[]
): string | undefined {
  const validos = ids.filter(
    (id): id is string => typeof id === "string" && id !== "",
  );
  return validos.length === 0 ? undefined : validos.join(" ");
}

/**
 * Os atributos de erro do campo (de `atributosDeErro`) mais o texto do "i":
 * o erro vem primeiro, que é o que a pessoa precisa ouvir antes.
 */
export function comInfo(
  para: string,
  atributos: { "aria-invalid"?: true; "aria-describedby"?: string },
): { "aria-invalid"?: true; "aria-describedby"?: string } {
  const descrito = descritores(atributos["aria-describedby"], idDoInfo(para));
  return descrito === undefined
    ? atributos
    : { ...atributos, "aria-describedby": descrito };
}
