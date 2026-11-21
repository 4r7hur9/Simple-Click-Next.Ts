/**
 * "Fale com a loja no WhatsApp" (card #107): um cartão no fim da página.
 *
 * Texto SEMPRE neutro: não promete prazo de resposta nem atendimento "agora", e
 * não usa termo de oficina nem "técnico" (a loja pode ser de qualquer ramo).
 * Só existe com o número que o dono marcou como público; sem ele, nada aparece.
 */
import { IconeConversa } from "@simpleclick/ui";

import { numeroDoWhatsApp } from "./sobre/formatos.ts";

export function ContatoDaLoja({
  nome,
  whatsappPublico,
}: {
  readonly nome: string;
  readonly whatsappPublico: string | null | undefined;
}) {
  if (!whatsappPublico) return null;
  const digitos = numeroDoWhatsApp(whatsappPublico);
  if (digitos === "") return null;

  return (
    <section className="sc-loja__contato" aria-labelledby="sc-loja-contato">
      <span className="sc-loja__contato-icone" aria-hidden="true">
        <IconeConversa />
      </span>
      <div className="sc-loja__contato-corpo">
        <h2 id="sc-loja-contato" className="sc-loja__contato-titulo">
          Fale com a loja no WhatsApp
        </h2>
        <p className="sc-loja__contato-texto">
          Dúvida sobre um produto ou um pedido? Converse direto com {nome}.
        </p>
      </div>
      <a
        className="sc-loja__contato-acao"
        href={`https://wa.me/${digitos}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <IconeConversa aria-hidden="true" />
        <span>
          Conversar no WhatsApp
          <span className="sc-so-leitor"> (abre em outra aba)</span>
        </span>
      </a>
    </section>
  );
}
