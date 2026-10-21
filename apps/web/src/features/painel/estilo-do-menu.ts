/**
 * As classes do menu lateral, num lugar só: o link, o botão Sair e o selo de
 * contador precisam ter exatamente a mesma cara. Tailwind enxerga estas
 * strings porque o arquivo está dentro de `src/`.
 */
export const FOCO =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cor-foco)] [&:focus:not(:focus-visible)]:outline-none!";

/** Item do menu: 44px de toque, ícone + nome; na faixa de ícones, só o ícone. */
export const BASE_DO_ITEM = `group relative flex min-h-[var(--altura-toque)] w-full items-center gap-3 rounded-[var(--raio)] px-3 text-left text-sm font-medium motion-safe:transition-colors motion-safe:duration-150 md:max-lg:justify-center md:max-lg:px-0 ${FOCO}`;

/**
 * O item ativo já é um bloco verde: o contorno de foco por fora dele virava um
 * anel duplo (verde, faixa escura, verde). No ativo o foco de teclado é um
 * contorno escuro POR DENTRO do verde, um só traço. O `!` vence a regra de
 * foco global de `componentes.css`, que fica fora das camadas do Tailwind.
 */
export const ITEM_ATIVO =
  "bg-[var(--cor-primaria)] font-semibold text-[var(--cor-em-primaria)] focus-visible:outline-offset-[-4px]! focus-visible:outline-[var(--cor-em-primaria)]!";
export const ITEM_PARADO =
  "bg-transparent text-[var(--cor-tinta-suave)] hover:bg-[var(--cor-superficie-alta)] hover:text-[var(--cor-tinta)]";

/**
 * O nome do item. Na faixa de ícones ele sai da vista mas continua no link
 * (é o que o leitor de tela lê); a dica que aparece ao lado é desenhada pelo
 * `MenuLateral` numa camada fixa, para a faixa poder rolar sem cortá-la.
 */
export const NOME_DO_ITEM = "truncate md:max-lg:sr-only";

export function classeDoItem(ativo: boolean): string {
  return `${BASE_DO_ITEM} ${ativo ? ITEM_ATIVO : ITEM_PARADO}`;
}

/** O título de uma seção: pequeno, em caixa alta; na faixa de ícones vira só leitor de tela. */
export const TITULO_DA_SECAO =
  "px-3 pb-1 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--cor-tinta-suave)] md:max-lg:sr-only";
