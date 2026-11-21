/**
 * Reconhece a rota da exibição de TV (`/loja/<apelido>/tv`).
 *
 * A TV é um quiosque sem teclado nem ponteiro: nada que peça um toque pode
 * ficar por cima do cardápio, porque ninguém consegue dispensar. Por isso o
 * aviso de cookies e a janela de entrar/criar conta não são montados nela.
 *
 * LGPD: a exibição não coleta nada não essencial. É uma página pública, sem
 * login, que só lê o catálogo público e não grava cookie de desempenho,
 * análise nem preferência. Sem coleta que dependa de consentimento, não há
 * escolha a pedir; quem abre a loja no celular ou no computador continua
 * vendo o aviso em todas as outras rotas.
 */
const ROTA_DA_TV = /^\/loja\/[^/]+\/tv\/?$/;

export function ehRotaDaTv(caminho: string | null | undefined): boolean {
  return caminho !== null && caminho !== undefined && ROTA_DA_TV.test(caminho);
}
