import type { ReactNode } from "react";

import { Info } from "@simpleclick/ui";

import type { Explicacao } from "./explicacoes.ts";

interface Props {
  /** O `id` do controle que o rótulo nomeia. */
  readonly htmlFor: string;
  readonly children: ReactNode;
  /** Nome curto do campo para o "Saiba mais sobre…" do "i". */
  readonly nome?: string | undefined;
  readonly info?: Explicacao | undefined;
  readonly pequeno?: boolean | undefined;
  readonly className?: string | undefined;
}

/**
 * Rótulo escrito à mão (fora do `Campo`) com lugar para o "i".
 *
 * O "i" fica como IRMÃO do `<label>`, na mesma linha, nunca dentro dele: dentro,
 * o texto do botão entraria no nome do controle para o leitor de tela.
 */
export function RotuloComInfo({
  htmlFor,
  children,
  nome,
  info,
  pequeno = false,
  className,
}: Props) {
  return (
    <span
      className={[
        // Sem flex-wrap: rótulo longo quebra dentro do <label> e o "i" fica
        // ao lado, em vez de cair sozinho na linha de baixo (celular).
        "sc-info-linha flex items-center gap-1.5",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <label
        htmlFor={htmlFor}
        className={pequeno ? "text-xs font-medium" : "text-sm font-medium"}
      >
        {children}
      </label>
      {info === undefined ? null : (
        <Info
          id={htmlFor}
          rotulo={
            nome ?? (typeof children === "string" ? children : "este campo")
          }
          conteudo={info}
        />
      )}
    </span>
  );
}

/** Rótulo visível (com o "i", quando há) em cima do controle. */
export function CampoComRotulo({
  id,
  rotulo,
  info,
  pequeno,
  className,
  children,
}: {
  readonly id: string;
  readonly rotulo: string;
  readonly info?: Explicacao | undefined;
  readonly pequeno?: boolean | undefined;
  readonly className?: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <div
      className={["grid content-start gap-2", className]
        .filter(Boolean)
        .join(" ")}
    >
      <RotuloComInfo htmlFor={id} nome={rotulo} info={info} pequeno={pequeno}>
        {rotulo}
      </RotuloComInfo>
      {children}
    </div>
  );
}

/** Título de lista ou de bloco (não é rótulo de controle) com o "i". */
export function TituloComInfo({
  nome,
  info,
  className,
  children,
}: {
  readonly nome: string;
  readonly info: Explicacao;
  readonly className?: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <p
      className={[
        "sc-info-linha flex flex-wrap items-center gap-1.5 text-sm font-medium",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
      <Info rotulo={nome} conteudo={info} />
    </p>
  );
}

/** O `aria-describedby` do controle que tem "i" (o texto escondido dele). */
export function descritoDoInfo(
  id: string,
  info: Explicacao | undefined,
): string | undefined {
  return info === undefined ? undefined : `${id}-info`;
}
