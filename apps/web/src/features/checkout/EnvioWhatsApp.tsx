"use client";

/**
 * Envio do pedido pelo WhatsApp (AC-520, AC-523).
 *
 * A ORDEM DAS COISAS É O DESENHO. O pedido já está criado quando esta tela
 * aparece — o número existe, a fila do dono já o recebeu, e o link de
 * acompanhamento já funciona. O botão daqui não cria nada: ele abre uma
 * conversa com um texto pronto. Fosse ao contrário (clicar, criar, depois
 * abrir), o navegador bloquearia a janela em silêncio, porque a autorização
 * para abrir vale só durante o gesto de quem clicou.
 *
 * É essa ordem que faz o AC-523 ser verdade sem nenhum esforço extra: se o
 * envio falhar, se o cliente fechar a janela antes, se o celular não tiver o
 * aplicativo — o pedido continua registrado. Esta tela só perde a mensagem,
 * nunca o pedido. E ela DIZ isso, em vez de deixar o cliente descobrir.
 */
import { useState } from "react";
import { Aviso, Botao, Cartao } from "@simpleclick/ui";

import { abrirConversa, type ResultadoDaAbertura } from "../../lib/whatsapp.ts";

export interface EnvioWhatsAppProps {
  /** Código que o cliente lê e dita, como "A-1042". */
  readonly codigoDoPedido: string;
  /** Endereço pronto da conversa, montado no servidor. */
  readonly enderecoDaConversa: string;
  /** O mesmo texto, para o caminho de copiar à mão. */
  readonly textoDoPedido: string;
  /** Onde o cliente acompanha o pedido, com ou sem WhatsApp. */
  readonly linkDeAcompanhamento: string;
  /** Registro assíncrono depois da abertura, sem bloquear o gesto do botão. */
  readonly aoAbrir?: (() => Promise<void> | void) | undefined;
  readonly abrir?: typeof window.open | undefined;
  readonly copiar?: ((texto: string) => Promise<void>) | undefined;
}

async function copiarPeloNavegador(texto: string): Promise<void> {
  await navigator.clipboard.writeText(texto);
}

export function EnvioWhatsApp({
  codigoDoPedido,
  enderecoDaConversa,
  textoDoPedido,
  linkDeAcompanhamento,
  aoAbrir,
  abrir,
  copiar = copiarPeloNavegador,
}: EnvioWhatsAppProps) {
  const [envio, setEnvio] = useState<ResultadoDaAbertura | null>(null);
  const [copiado, setCopiado] = useState(false);

  function enviar() {
    // A abertura acontece AQUI, dentro do gesto. Nada de esperar resposta de
    // servidor antes: quando a espera termina, a autorização já expirou.
    const comoAbrir = abrir ?? window.open;
    const resultado = abrirConversa(enderecoDaConversa, comoAbrir);
    setEnvio(resultado);
    if (resultado === "abriu") void aoAbrir?.();
  }

  async function copiarTexto() {
    try {
      await copiar(textoDoPedido);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  const naoAbriu = envio === "bloqueado" || envio === "endereco-invalido";

  return (
    <Cartao
      className="sc-envio"
      titulo={`Pedido ${codigoDoPedido} registrado`}
      nivelDoTitulo={3}
    >
      {/* Vem ANTES do botão de propósito: a primeira coisa que o cliente
          precisa saber é que o pedido existe, aconteça o que acontecer com a
          mensagem. */}
      <p className="sc-envio__garantia">
        Seu pedido já está na fila da loja. Envie a mensagem para o dono
        confirmar mais rápido.
      </p>

      <Botao tamanho="grande" forma="pilula" onClick={enviar}>
        Enviar pelo WhatsApp
      </Botao>

      {envio === "abriu" ? (
        <Aviso tom="sucesso" titulo="Conversa aberta">
          Toque em enviar na conversa para o dono receber. Não enviou? Clique de
          novo no botão acima.
        </Aviso>
      ) : null}

      {naoAbriu ? (
        <Aviso tom="atencao" titulo="Não conseguimos abrir a conversa">
          {envio === "bloqueado"
            ? "Seu navegador bloqueou a janela. Use o link abaixo ou copie o texto e cole na conversa com a loja."
            : "O endereço da conversa não pôde ser usado. Copie o texto abaixo e envie para a loja."}
        </Aviso>
      ) : null}

      {naoAbriu && envio === "bloqueado" ? (
        // Um link de verdade, para o clique ser do usuário e não do código —
        // navegador nenhum bloqueia isso.
        <p>
          <a
            href={enderecoDaConversa}
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir a conversa com a loja
          </a>
        </p>
      ) : null}

      {naoAbriu ? (
        <>
          <Botao variante="secundaria" onClick={copiarTexto}>
            Copiar o texto do pedido
          </Botao>
          {copiado ? (
            <Aviso tom="sucesso">
              Texto copiado. Cole na conversa com a loja.
            </Aviso>
          ) : null}
        </>
      ) : null}

      <p className="sc-envio__acompanhar">
        <a href={linkDeAcompanhamento}>Acompanhar meu pedido</a>
      </p>
    </Cartao>
  );
}
