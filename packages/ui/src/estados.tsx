import type { ReactNode } from "react";

import { IconeVazio } from "./icones";

/**
 * Os quatro estados de tela, em componentes reutilizáveis (P-011, AC-013).
 *
 * Existem separados dos componentes de conteúdo porque a tela que carrega dado
 * precisa dos quatro sempre, e escrever "nenhum resultado" na mão em cada tela
 * é como o v1 acabou com quatro textos diferentes para a mesma situação — e
 * com telas que simplesmente não mostravam nada enquanto esperavam.
 *
 * Cada estado carrega o papel de acessibilidade certo: espera e sucesso são
 * `status` (o leitor de tela avisa na primeira pausa), erro é `alert` (o leitor
 * de tela interrompe). Trocar isso faz o cego perder o erro ou ser interrompido
 * por uma barra de progresso.
 */

/** O que uma tela que busca dado pode estar vivendo agora. */
export type EstadoDaTela =
  "carregando" | "vazio" | "erro" | "sucesso" | "pronto";

const juntar = (...classes: (string | false | undefined)[]): string =>
  classes.filter(Boolean).join(" ");

/** Indicador de espera puramente decorativo: quem anuncia é o texto ao lado. */
export function Girando({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={juntar("sc-girando", className)} />
  );
}

export type CarregandoProps = {
  /** O que está sendo esperado, em português e no tempo presente. */
  rotulo?: string | undefined;
  /** Some com o texto na tela, mas o mantém para o leitor de tela. */
  apenasParaLeitor?: boolean | undefined;
  className?: string | undefined;
};

/**
 * Estado de espera. Nunca fica mudo: mesmo quando o texto é escondido, ele
 * continua na árvore para o leitor de tela anunciar.
 */
export function Carregando({
  rotulo = "Carregando…",
  apenasParaLeitor = false,
  className,
}: CarregandoProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={juntar("sc-estado", "sc-estado--carregando", className)}
    >
      <Girando />
      <span className={apenasParaLeitor ? "sc-so-leitor" : undefined}>
        {rotulo}
      </span>
    </div>
  );
}

export type EsqueletoProps = {
  /** Quantas linhas cinzentas desenhar enquanto o conteúdo não chega. */
  linhas?: number | undefined;
  /** Texto que o leitor de tela ouve no lugar do desenho. */
  rotulo?: string | undefined;
  className?: string | undefined;
};

/**
 * Espera com a forma do conteúdo que vai chegar. O desenho é escondido do
 * leitor de tela, porque barra cinza não significa nada para quem não vê — o
 * anúncio vem do texto que acompanha.
 */
export function Esqueleto({
  linhas = 3,
  rotulo = "Carregando conteúdo…",
  className,
}: EsqueletoProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={juntar("sc-esqueleto", className)}
    >
      <span className="sc-so-leitor">{rotulo}</span>
      {Array.from({ length: Math.max(1, linhas) }, (_, indice) => (
        <span aria-hidden="true" className="sc-esqueleto__linha" key={indice} />
      ))}
    </div>
  );
}

export type VazioProps = {
  titulo: string;
  descricao?: string | undefined;
  /** O caminho de saída: sem ele, o vazio vira beco sem saída. */
  acao?: ReactNode | undefined;
  className?: string | undefined;
};

/** Estado de lista sem nenhum item — que é diferente de erro e de espera. */
export function Vazio({ titulo, descricao, acao, className }: VazioProps) {
  return (
    <div
      className={juntar(
        "sc-estado",
        "sc-estado--vazio",
        "sc-estado--centro",
        className,
      )}
    >
      <IconeVazio aria-hidden="true" className="sc-estado__icone" size={28} />
      <p className="sc-estado__titulo">{titulo}</p>
      {descricao !== undefined && (
        <p className="sc-estado__descricao">{descricao}</p>
      )}
      {acao}
    </div>
  );
}

export type ErroProps = {
  titulo?: string | undefined;
  /** O que aconteceu, em linguagem de gente. Nunca a mensagem crua do sistema. */
  mensagem: string;
  /** Código curto que liga a tela ao registro do servidor (AC-024). */
  referencia?: string | undefined;
  acao?: ReactNode | undefined;
  className?: string | undefined;
};

/**
 * Estado de falha. Só o que o usuário precisa saber, mais um código de
 * referência: detalhe interno na tela vaza topologia e, no caso errado, dado
 * pessoal junto (P-009).
 */
export function Erro({
  titulo = "Algo deu errado",
  mensagem,
  referencia,
  acao,
  className,
}: ErroProps) {
  return (
    <div
      role="alert"
      className={juntar("sc-estado", "sc-estado--erro", className)}
    >
      <p className="sc-estado__titulo">{titulo}</p>
      <p className="sc-estado__descricao">{mensagem}</p>
      {referencia !== undefined && (
        <p className="sc-estado__referencia">Referência: {referencia}</p>
      )}
      {acao}
    </div>
  );
}

export type SucessoProps = {
  titulo: string;
  descricao?: string | undefined;
  acao?: ReactNode | undefined;
  className?: string | undefined;
};

/** Estado de conclusão: confirma o que aconteceu sem roubar o foco de quem digita. */
export function Sucesso({ titulo, descricao, acao, className }: SucessoProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={juntar("sc-estado", "sc-estado--sucesso", className)}
    >
      <p className="sc-estado__titulo">{titulo}</p>
      {descricao !== undefined && (
        <p className="sc-estado__descricao">{descricao}</p>
      )}
      {acao}
    </div>
  );
}
