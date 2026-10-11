import type { ReactNode } from "react";

/**
 * Aviso: uma mensagem curta com tom.
 *
 * Os tons cobrem três dos quatro estados de tela — sucesso, erro e atenção —
 * mais o informativo. "Vazio" não é tom de aviso: para isso existe o estado
 * `Vazio` de `estados.tsx`, que ocupa o lugar do conteúdo em vez de comentá-lo.
 *
 * O papel de acessibilidade acompanha a urgência: erro interrompe o leitor de
 * tela (`alert`), o resto espera a próxima pausa (`status`). Aviso que não muda
 * durante a visita não anuncia nada — `aoVivo={false}` — porque leitor de tela
 * repetindo texto estático a cada re-renderização é ruído, não acessibilidade.
 */

export type TomDeAviso = "info" | "sucesso" | "erro" | "atencao";

export type AvisoProps = {
  tom?: TomDeAviso | undefined;
  titulo?: string | undefined;
  children: ReactNode;
  /** Ação de saída, como "tentar de novo" ou "ver detalhes". */
  acao?: ReactNode | undefined;
  /** O aviso apareceu agora e precisa ser anunciado. Padrão: sim. */
  aoVivo?: boolean | undefined;
  className?: string | undefined;
};

/** Mostra a mensagem com o tom e o anúncio que a urgência pede. */
export function Aviso({
  tom = "info",
  titulo,
  children,
  acao,
  aoVivo = true,
  className,
}: AvisoProps) {
  const papel = aoVivo ? (tom === "erro" ? "alert" : "status") : undefined;

  return (
    <div
      className={["sc-aviso", `sc-aviso--${tom}`, className]
        .filter(Boolean)
        .join(" ")}
      role={papel}
      aria-live={papel === "status" ? "polite" : undefined}
    >
      {titulo !== undefined && <p className="sc-aviso__titulo">{titulo}</p>}
      <div>{children}</div>
      {acao}
    </div>
  );
}
