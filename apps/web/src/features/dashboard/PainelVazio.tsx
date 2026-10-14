"use client";

/**
 * O período sem nenhum pedido (T-803; AC-801).
 *
 * ZERO SECO NÃO ORIENTA NINGUÉM. O dono que abre o painel às nove da manhã e
 * vê "R$ 0,00" não sabe se a loja está fora do ar, se o painel quebrou ou se
 * só ainda não houve pedido. Este bloco diz qual das três é — ainda não houve
 * pedido — e entrega o próximo passo que traz o primeiro: o link da vitrine,
 * pronto para copiar ou mandar no WhatsApp.
 *
 * Os números zerados continuam na tela, logo abaixo, e não são escondidos: o
 * AC-801 pede a explicação JUNTO dos zeros, e não no lugar deles.
 */
import { useId, useState } from "react";

export interface PainelVazioProps {
  /** O apelido da loja, de onde sai o link da vitrine. */
  readonly apelido: string;
  /** O período é o dia de hoje (muda a frase, não o caminho). */
  readonly hoje: boolean;
  /**
   * O endereço do site, para o link sair completo. Sem ele, vale o da página
   * aberta — este bloco só aparece depois da leitura, já no navegador.
   */
  readonly origem?: string | undefined;
}

type Copia = "parada" | "copiado" | "falhou";

function origemDaPagina(): string {
  return typeof window === "undefined" ? "" : window.location.origin;
}

export function PainelVazio({ apelido, hoje, origem }: PainelVazioProps) {
  const idDoTitulo = useId();
  const idDoLink = useId();
  const [copia, setCopia] = useState<Copia>("parada");

  const caminho = `/l/${encodeURIComponent(apelido)}`;
  const link = `${origem ?? origemDaPagina()}${caminho}`;
  const mensagem = `Faça seu pedido pelo nosso cardápio: ${link}`;

  async function copiar(): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
      setCopia("copiado");
    } catch {
      // Sem permissão de área de transferência (navegador antigo, página sem
      // HTTPS): o link continua escrito e selecionável logo acima.
      setCopia("falhou");
      const campo = document.getElementById(idDoLink);
      if (campo instanceof HTMLInputElement) campo.select();
    }
  }

  return (
    <section
      aria-labelledby={idDoTitulo}
      data-painel-vazio
      className="rounded-[var(--raio-cartao)] border border-dashed border-borda-forte bg-superficie p-4 min-[540px]:p-5"
    >
      <h2 id={idDoTitulo} className="text-lg font-semibold">
        {hoje ? "Ainda não houve pedido hoje" : "Nenhum pedido neste período"}
      </h2>
      <p className="mt-2 leading-7 text-tinta-suave">
        {hoje
          ? "Os números abaixo estão zerados porque nenhum pedido entrou hoje. Assim que o primeiro chegar — pelo site ou lançado no balcão —, ele aparece aqui."
          : "Os números abaixo estão zerados porque nenhum pedido entrou no período escolhido. Troque o período para ver outros dias."}
      </p>
      <p className="mt-3 font-medium">
        Quem recebe o link da sua vitrine pede direto pelo celular.
      </p>

      <label htmlFor={idDoLink} className="mt-3 block text-sm text-tinta-suave">
        Link da sua vitrine
      </label>
      <input
        id={idDoLink}
        data-link-da-vitrine
        readOnly
        value={link}
        onFocus={(evento) => evento.currentTarget.select()}
        className="sc-campo__controle mt-1 w-full min-w-0"
      />

      <div className="mt-3 flex flex-col gap-2 min-[540px]:flex-row min-[540px]:flex-wrap">
        <button
          type="button"
          className="sc-botao sc-botao--primaria"
          onClick={() => void copiar()}
        >
          Copiar link
        </button>
        <a
          className="sc-botao sc-botao--secundaria"
          href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Enviar pelo WhatsApp
        </a>
        <a className="sc-botao sc-botao--discreta" href={caminho}>
          Abrir minha vitrine
        </a>
      </div>

      <p role="status" className="mt-2 min-h-6 text-sm text-tinta-suave">
        {copia === "copiado"
          ? "Link copiado. Cole na conversa ou no status do WhatsApp."
          : copia === "falhou"
            ? "Não deu para copiar sozinho: o link está selecionado acima, é só copiar."
            : ""}
      </p>
    </section>
  );
}
