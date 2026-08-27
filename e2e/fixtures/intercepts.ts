/**
 * O que o ponta a ponta NÃO deixa sair da máquina.
 *
 * O ENVIO PELO WHATSAPP ABRE UMA JANELA para `wa.me`, que é um serviço de
 * terceiro. Deixar o cenário abri-la de verdade traria três problemas de uma
 * vez: depender de rede externa para um teste que fala do nosso texto, deixar
 * uma aba órfã a cada execução, e falhar quando o serviço estiver lento — por
 * um motivo que não é o do cenário.
 *
 * A interceptação substitui `window.open` por um registro. O que se prova
 * continua sendo o que interessa: que o gesto abre a conversa CERTA, com o
 * texto CERTO — e é o endereço que carrega os dois.
 */
import type { Page } from "@playwright/test";

/** O que a página tentou abrir. */
export interface JanelaAberta {
  readonly endereco: string;
  readonly alvo: string;
}

declare global {
  interface Window {
    /** Onde a interceptação guarda o que foi aberto. */
    __janelasAbertas?: JanelaAberta[];
  }
}

/**
 * Troca `window.open` por um registro, antes de a página carregar.
 *
 * `addInitScript` roda ANTES de qualquer script da página, e isso é o que faz a
 * troca valer: instalada depois, o componente já teria guardado a referência
 * original e a interceptação não pegaria nada.
 *
 * O retorno é um objeto qualquer, e não `null`: `null` é como o navegador diz
 * "bloqueei a janela", e o componente trata isso como falha de envio (AC-523).
 * Devolver nulo aqui faria todo cenário exercitar o caminho do erro.
 */
export async function interceptarWhatsApp(pagina: Page): Promise<void> {
  await pagina.addInitScript(() => {
    window.__janelasAbertas = [];
    window.open = (endereco?: string | URL, alvo?: string) => {
      window.__janelasAbertas?.push({
        endereco: String(endereco ?? ""),
        alvo: String(alvo ?? ""),
      });
      return {} as Window;
    };
  });
}

/** O que a página tentou abrir até agora. */
export async function janelasAbertas(pagina: Page): Promise<JanelaAberta[]> {
  return pagina.evaluate(() => window.__janelasAbertas ?? []);
}
