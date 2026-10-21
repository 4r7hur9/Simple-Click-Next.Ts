/**
 * A regra das faixas de atacado para as telas do painel (card #55).
 *
 * A conta e as travas moram em `packages/core` (card #53) e são as mesmas que
 * a API confere ao gravar. Ficam reexportadas daqui porque os componentes
 * (`web-features`) alcançam `web-lib`, e não o core — como em `dinheiro.ts`.
 */
export { problemasDasFaixas, unitarioNaFaixa } from "@simpleclick/core";
export type {
  FaixaDeAtacado,
  ProblemaDaFaixa,
  TipoDeDescontoDoAtacado,
} from "@simpleclick/core";
