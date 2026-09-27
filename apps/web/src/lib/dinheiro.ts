/**
 * Leitura de dinheiro para os formulários do painel (AC-311, P-005).
 *
 * O dono digita "19,99" no celular, e o que vai para a API tem de ser 1999 —
 * inteiro. `19.99 * 100` dá `1998.9999999999998`, e a grade de variações já
 * mandou esse número quebrado para a API antes deste módulo existir.
 *
 * A regra mora em `packages/core`, e é reexportada daqui porque os componentes
 * (`web-features`) alcançam `web-lib`, e não o core.
 */
export { centavosDoTexto } from "@simpleclick/core";
export { emReais as escreverDinheiro } from "@simpleclick/core";
