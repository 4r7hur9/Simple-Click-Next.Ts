/**
 * Apaga o que o feed guardou da pessoa neste aparelho: a localização
 * (`sc:feed:local`) e os stories vistos (`sc:feed:stories-vistos`). É a mesma
 * função que o botão Sair e o topo do cliente (card #105) chamam, reexportada
 * aqui com o nome do contrato do #106 (AC-10619): uma só implementação.
 */
export { limparDadosLocaisDoCliente as limparDadosLocaisDoFeed } from "../usuario/local-do-aparelho.ts";
