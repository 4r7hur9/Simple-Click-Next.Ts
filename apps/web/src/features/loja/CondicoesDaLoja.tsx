/**
 * As condições de compra da loja: como receber, onde fica, como paga (cards
 * #107 e #129). No layout do Stitch são TRÊS CARTÕES lado a lado, de altura
 * igual, com o ícone num quadrado arredondado; no celular eles empilham.
 *
 * SÓ O QUE A LOJA CADASTROU. Cada cartão some sem dado: nada de cartão vazio,
 * de traço no lugar do dado nem de informação de outra loja. As formas aparecem
 * pelo nome ("Entrega", "Pix"), nunca pelo código do banco.
 *
 * O pagamento chega como lista de nomes (`RecebimentoDaLoja`): a chave PIX mora
 * na mesma resposta do fechamento e NUNCA passa por aqui (critério legado 904).
 *
 * Horários e contato moram no Sobre, que a faixa de seções logo abaixo leva.
 */
import type { ReactNode } from "react";
import {
  IconeAbrirFora,
  IconeCartao,
  IconeEntrega,
  IconeLocal,
} from "@simpleclick/ui";

import type { RecebimentoDaLoja } from "./SobreDaLoja.tsx";
import { enderecoNoMapa, type EnderecoNaTela } from "./sobre/formatos.ts";
import { nomeDaFormaDePagamento } from "./sobre/SecoesDoSobre.tsx";

const NOME_DA_ENTREGA: Record<string, string> = {
  DELIVERY: "Entrega",
  PICKUP: "Retirada no local",
};

/** Junta as partes do endereço numa linha, sem vírgula sobrando. */
function enderecoEmUmaLinha(endereco: EnderecoNaTela): string {
  const rua = [endereco.logradouro, endereco.numero].filter(Boolean).join(", ");
  const cidade = [endereco.cidade, endereco.uf].filter(Boolean).join("/");
  return [rua, endereco.complemento, endereco.bairro, cidade]
    .filter(Boolean)
    .join(" · ");
}

export interface CondicoesDaLojaProps {
  readonly apelido: string;
  readonly formasDeEntrega: readonly string[];
  readonly endereco: EnderecoNaTela | null;
  /** Pagamento e entrega, sem a chave PIX; nulo se o fechamento não respondeu. */
  readonly recebimento?: RecebimentoDaLoja | null | undefined;
}

/** Um cartão de condição: o ícone no quadrado, o rótulo, o título e o corpo. */
function Ficha({
  icone,
  rotulo,
  titulo,
  children,
}: {
  readonly icone: ReactNode;
  readonly rotulo: string;
  readonly titulo: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="sc-loja__ficha">
      <div className="sc-loja__ficha-topo">
        <span className="sc-loja__ficha-icone" aria-hidden="true">
          {icone}
        </span>
        <div className="sc-loja__ficha-cabeca">
          <p className="sc-loja__ficha-rotulo">{rotulo}</p>
          <h2 className="sc-loja__ficha-titulo">{titulo}</h2>
        </div>
      </div>
      {children}
    </div>
  );
}

export function CondicoesDaLoja({
  formasDeEntrega,
  endereco,
  recebimento = null,
}: CondicoesDaLojaProps) {
  const pagamento = recebimento?.formasDePagamento ?? [];
  const linhaDoEndereco = endereco ? enderecoEmUmaLinha(endereco) : "";
  const mapa =
    endereco && linhaDoEndereco !== "" ? enderecoNoMapa(endereco) : null;

  if (
    formasDeEntrega.length === 0 &&
    linhaDoEndereco === "" &&
    pagamento.length === 0
  ) {
    return null;
  }

  return (
    <footer className="sc-loja__detalhes sc-loja__condicoes">
      {formasDeEntrega.length > 0 ? (
        <Ficha
          icone={<IconeEntrega />}
          rotulo="Entrega e retirada"
          titulo="Como receber"
        >
          <ul className="sc-loja__formas">
            {formasDeEntrega.map((forma) => (
              <li key={forma}>{NOME_DA_ENTREGA[forma] ?? forma}</li>
            ))}
          </ul>
        </Ficha>
      ) : null}

      {linhaDoEndereco !== "" ? (
        <Ficha
          icone={<IconeLocal />}
          rotulo="Localização"
          titulo="Onde estamos"
        >
          <address className="sc-loja__endereco">{linhaDoEndereco}</address>
          {mapa ? (
            <a
              className="sc-loja__mapa"
              href={mapa}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir no mapa
              <IconeAbrirFora aria-hidden="true" width={16} height={16} />
              <span className="sc-so-leitor"> (abre em outra aba)</span>
            </a>
          ) : null}
        </Ficha>
      ) : null}

      {pagamento.length > 0 ? (
        <Ficha
          icone={<IconeCartao />}
          rotulo="Formas de pagamento"
          titulo="Pagamento"
        >
          <ul className="sc-loja__formas">
            {pagamento.map((forma) => (
              <li key={forma}>{nomeDaFormaDePagamento(forma)}</li>
            ))}
          </ul>
        </Ficha>
      ) : null}
    </footer>
  );
}
