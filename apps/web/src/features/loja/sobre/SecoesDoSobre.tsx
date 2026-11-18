/**
 * As seções do "Sobre a loja": cada uma é um cartão, e cada uma SOME quando a
 * loja não tem o dado. Cartão vazio com "não informado" ensina o cliente a
 * desconfiar da página; cartão ausente não ensina nada.
 *
 * Tudo aqui é do servidor e sem script. Só o que a loja cadastrou aparece —
 * nada é inventado para preencher espaço.
 */
import type { ReactNode } from "react";

import {
  IconeAbrirFora,
  IconeCartao,
  IconeConversa,
  IconeDinheiro,
  IconeEntrega,
  IconeHistoria,
  IconeLocal,
  IconeLoja,
  IconePix,
  IconeRelogio,
  Selo,
} from "@simpleclick/ui";

import { escreverDinheiro } from "../../../lib/dinheiro.ts";
import {
  dividirHistoria,
  enderecoEmLinhas,
  enderecoNoMapa,
  NOME_DO_DIA,
  numeroDoWhatsApp,
  ORDEM_DA_SEMANA,
  telefoneLegivel,
  textoDoDia,
  textoDoPrazo,
  type EnderecoNaTela,
  type FaixaNaTela,
} from "./formatos.ts";

/** O que o dono configurou sobre entrega — o mesmo formato do contrato. */
export interface EntregaNaTela {
  readonly aceitaEntrega: boolean;
  readonly aceitaRetirada: boolean;
  /** Zero é taxa zero; NULO é "a combinar". */
  readonly taxaCentavos: number | null;
  readonly nomeDaTaxa: string | null;
  readonly gratisAcimaDeCentavos: number | null;
  readonly minimoParaEntregaCentavos: number | null;
  readonly minimoParaRetiradaCentavos: number | null;
  readonly prazoMinutos: number | null;
}

/** A grade semanal, como a vitrine a devolve. */
export interface HorarioNaTela {
  readonly modo:
    "SCHEDULE" | "ALWAYS_OPEN" | "TEMPORARILY_CLOSED" | "PERMANENTLY_CLOSED";
  readonly semana: readonly {
    readonly dia: number;
    readonly faixas: readonly FaixaNaTela[];
  }[];
}

/** Se a loja está aberta agora — o mesmo formato da apresentação. */
export interface AberturaDoSobre {
  readonly aberta: boolean;
  readonly proximaAbertura: string | null;
  readonly motivo: string;
  readonly explicacaoDaExcecao?: string | null | undefined;
}

// ---------------------------------------------------------------------------
// A moldura de cada seção
// ---------------------------------------------------------------------------

/**
 * Um cartão de seção: ícone num quadrado verde-click, o título com filete e o
 * conteúdo. O `id` é o destino do atalho do topo — e é o que deixa o atalho
 * funcionar sem script, como âncora comum.
 */
function CartaoDaSecao({
  id,
  titulo,
  icone,
  largo = false,
  children,
}: {
  readonly id: string;
  readonly titulo: string;
  readonly icone: ReactNode;
  readonly largo?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={`sc-sobre__cartao${largo ? " sc-sobre__cartao--largo" : ""}`}
      aria-labelledby={`${id}-titulo`}
    >
      <header className="sc-sobre__cartao-topo">
        <span className="sc-sobre__icone" aria-hidden="true">
          {icone}
        </span>
        <h2 id={`${id}-titulo`} className="sc-sobre__cartao-titulo">
          {titulo}
        </h2>
      </header>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Nossa história
// ---------------------------------------------------------------------------

/**
 * O texto Sobre, com a abertura em destaque. Do tablet em diante a janela cabe
 * na tela, e o texto longo é cortado por linhas (só no visual: o HTML o traz
 * inteiro). No celular, que rola, ele aparece todo.
 */
export function NossaHistoria({ texto }: { readonly texto: string }) {
  const { abertura, corpo } = dividirHistoria(texto);

  return (
    <CartaoDaSecao
      id="sobre-historia"
      titulo="Nossa história"
      icone={<IconeHistoria />}
      largo
    >
      <p className="sc-sobre__abertura">{abertura}</p>
      {corpo.length > 0 ? (
        <div className="sc-sobre__texto">
          {corpo.map((paragrafo) => (
            <p key={paragrafo}>{paragrafo}</p>
          ))}
        </div>
      ) : null}
    </CartaoDaSecao>
  );
}

// ---------------------------------------------------------------------------
// Horários
// ---------------------------------------------------------------------------

/** A situação de agora, como selo: o texto diz, a bolinha enfeita. */
export function SeloDaSituacao({
  abertura,
}: {
  readonly abertura: AberturaDoSobre;
}) {
  if (abertura.aberta) return <Selo tom="sucesso">Aberta agora</Selo>;

  const explicacao =
    abertura.motivo === "EXCECAO" && abertura.explicacaoDaExcecao
      ? abertura.explicacaoDaExcecao
      : "Fechada agora";
  return <Selo tom="atencao">{explicacao}</Selo>;
}

export function HorariosDaLoja({
  horario,
  abertura,
  hoje,
}: {
  readonly horario: HorarioNaTela | null;
  readonly abertura: AberturaDoSobre;
  /** O dia da semana de hoje, no fuso da loja (0 = domingo). */
  readonly hoje: number;
}) {
  const faixasDoDia = (dia: number) =>
    horario?.semana.find((linha) => linha.dia === dia)?.faixas ?? [];
  const temGrade =
    horario !== null &&
    (horario.modo === "ALWAYS_OPEN" ||
      horario.semana.some((linha) => linha.faixas.length > 0));

  return (
    <CartaoDaSecao
      id="sobre-horarios"
      titulo="Horários"
      icone={<IconeRelogio />}
    >
      <div className="sc-sobre__situacao">
        <SeloDaSituacao abertura={abertura} />
        {!abertura.aberta && abertura.proximaAbertura ? (
          <span className="sc-sobre__proxima">
            {abertura.proximaAbertura.charAt(0).toUpperCase() +
              abertura.proximaAbertura.slice(1)}
          </span>
        ) : null}
      </div>

      {horario?.modo === "PERMANENTLY_CLOSED" ? (
        <p className="sc-sobre__nota">
          A loja não está recebendo pedidos no momento.
        </p>
      ) : temGrade ? (
        <>
          {horario.modo === "TEMPORARILY_CLOSED" ? (
            <p className="sc-sobre__nota">
              Fechada temporariamente. Quando voltar, o horário é este:
            </p>
          ) : null}
          <table className="sc-sobre__semana">
            <caption className="sc-so-leitor">
              Horário de funcionamento, de segunda a domingo
            </caption>
            <tbody>
              {ORDEM_DA_SEMANA.map((dia) => {
                const texto =
                  horario.modo === "ALWAYS_OPEN"
                    ? "24 horas"
                    : textoDoDia(faixasDoDia(dia));
                const ehHoje = dia === hoje;
                return (
                  <tr
                    key={dia}
                    className={ehHoje ? "sc-sobre__hoje" : undefined}
                    aria-current={ehHoje ? "date" : undefined}
                  >
                    <th scope="row">
                      {NOME_DO_DIA[dia]}
                      {ehHoje ? (
                        <span className="sc-sobre__marca-hoje">Hoje</span>
                      ) : null}
                    </th>
                    <td className={texto ? undefined : "sc-sobre__fechado"}>
                      {texto ?? "Fechado"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      ) : (
        <p className="sc-sobre__nota">
          A loja ainda não publicou o horário da semana.
        </p>
      )}
    </CartaoDaSecao>
  );
}

// ---------------------------------------------------------------------------
// Como receber
// ---------------------------------------------------------------------------

/** "Taxa de entrega R$ 6,00", "Entrega sem taxa" ou "Taxa a combinar". */
function textoDaTaxa(entrega: EntregaNaTela): string {
  if (entrega.taxaCentavos === null) return "Taxa a combinar com a loja";
  if (entrega.taxaCentavos === 0) return "Entrega sem taxa";
  return `${entrega.nomeDaTaxa ?? "Taxa de entrega"}: ${escreverDinheiro(
    entrega.taxaCentavos,
  ).replace(" ", "\u00a0")}`;
}

export function ComoReceber({
  formasDeEntrega,
  entrega,
  endereco,
}: {
  /** As formas da vitrine — o que vale quando o fechamento não respondeu. */
  readonly formasDeEntrega: readonly string[];
  readonly entrega: EntregaNaTela | null;
  readonly endereco: EnderecoNaTela | null;
}) {
  const fazEntrega =
    entrega?.aceitaEntrega ?? formasDeEntrega.includes("DELIVERY");
  const fazRetirada =
    entrega?.aceitaRetirada ?? formasDeEntrega.includes("PICKUP");
  if (!fazEntrega && !fazRetirada) return null;

  const ondeRetirar = endereco
    ? [endereco.bairro, endereco.cidade].filter(Boolean).join(", ")
    : "";

  return (
    <CartaoDaSecao
      id="sobre-receber"
      titulo="Como receber"
      icone={<IconeEntrega />}
    >
      <ul className="sc-sobre__modos">
        {fazEntrega ? (
          <li className="sc-sobre__modo">
            <span className="sc-sobre__modo-icone" aria-hidden="true">
              <IconeEntrega />
            </span>
            <div className="sc-sobre__modo-texto">
              <p className="sc-sobre__modo-nome">Entrega</p>
              {entrega ? (
                <ul className="sc-sobre__fatos">
                  <li>{textoDaTaxa(entrega)}</li>
                  {entrega.prazoMinutos ? (
                    <li>
                      Chega em cerca de{" "}
                      <span className="sc-sobre__valor">
                        {textoDoPrazo(entrega.prazoMinutos)}
                      </span>
                    </li>
                  ) : null}
                  {entrega.minimoParaEntregaCentavos ? (
                    <li>
                      Pedido mínimo de{" "}
                      <span className="sc-sobre__valor">
                        {escreverDinheiro(entrega.minimoParaEntregaCentavos)}
                      </span>
                    </li>
                  ) : null}
                </ul>
              ) : (
                <p className="sc-sobre__fatos">A loja leva até você.</p>
              )}
              {entrega?.gratisAcimaDeCentavos &&
              (entrega.taxaCentavos ?? 1) > 0 ? (
                <p className="sc-sobre__gratis">
                  Frete grátis a partir de{" "}
                  <span className="sc-sobre__valor">
                    {escreverDinheiro(entrega.gratisAcimaDeCentavos)}
                  </span>
                </p>
              ) : null}
            </div>
          </li>
        ) : null}

        {fazRetirada ? (
          <li className="sc-sobre__modo">
            <span className="sc-sobre__modo-icone" aria-hidden="true">
              <IconeLoja />
            </span>
            <div className="sc-sobre__modo-texto">
              <p className="sc-sobre__modo-nome">Retirada no local</p>
              <ul className="sc-sobre__fatos">
                <li>Sem taxa{ondeRetirar ? `, em ${ondeRetirar}` : ""}</li>
                {entrega?.minimoParaRetiradaCentavos ? (
                  <li>
                    Pedido mínimo de{" "}
                    <span className="sc-sobre__valor">
                      {escreverDinheiro(entrega.minimoParaRetiradaCentavos)}
                    </span>
                  </li>
                ) : null}
              </ul>
            </div>
          </li>
        ) : null}
      </ul>
    </CartaoDaSecao>
  );
}

// ---------------------------------------------------------------------------
// Formas de pagamento
// ---------------------------------------------------------------------------

/** O nome e o ícone de cada forma que a versão 1 conhece. */
const PAGAMENTO: Record<
  string,
  { readonly nome: string; readonly icone: ReactNode }
> = {
  PIX: { nome: "Pix", icone: <IconePix /> },
  CASH: { nome: "Dinheiro", icone: <IconeDinheiro /> },
  CARD_ON_DELIVERY: { nome: "Cartão na entrega", icone: <IconeCartao /> },
};

/** O nome por extenso de uma forma de pagamento; o código desconhecido sai como veio. */
export function nomeDaFormaDePagamento(forma: string): string {
  return PAGAMENTO[forma]?.nome ?? forma;
}

/**
 * As formas de pagamento, em pílulas. SÓ O NOME: a chave PIX mora na mesma
 * resposta do fechamento e não aparece aqui — ela é do momento de pagar, e não
 * de quem está conhecendo a loja (AC-904).
 */
export function FormasDePagamento({
  formas,
}: {
  readonly formas: readonly string[];
}) {
  if (formas.length === 0) return null;
  return (
    <CartaoDaSecao
      id="sobre-pagamento"
      titulo="Formas de pagamento"
      icone={<IconeCartao />}
    >
      <ul className="sc-sobre__pilulas">
        {formas.map((forma) => (
          <li key={forma} className="sc-sobre__pilula">
            <span aria-hidden="true">{PAGAMENTO[forma]?.icone}</span>
            {PAGAMENTO[forma]?.nome ?? forma}
          </li>
        ))}
      </ul>
      <p className="sc-sobre__nota">Você escolhe a forma ao fechar o pedido.</p>
    </CartaoDaSecao>
  );
}

// ---------------------------------------------------------------------------
// Onde estamos
// ---------------------------------------------------------------------------

export function OndeEstamos({
  endereco,
}: {
  readonly endereco: EnderecoNaTela | null;
}) {
  if (endereco === null) return null;
  const linhas = enderecoEmLinhas(endereco);
  if (linhas.length === 0) return null;
  const mapa = enderecoNoMapa(endereco);

  return (
    <CartaoDaSecao
      id="sobre-endereco"
      titulo="Onde estamos"
      icone={<IconeLocal />}
    >
      <address className="sc-sobre__endereco">
        {linhas.map((linha) => (
          <span key={linha}>{linha}</span>
        ))}
      </address>
      {mapa ? (
        <a
          className="sc-botao sc-botao--secundaria sc-botao--pilula sc-sobre__acao"
          href={mapa}
          target="_blank"
          rel="noopener noreferrer"
        >
          <IconeAbrirFora aria-hidden="true" />
          Abrir no mapa
          <span className="sc-so-leitor"> (abre em outra aba)</span>
        </a>
      ) : null}
    </CartaoDaSecao>
  );
}

// ---------------------------------------------------------------------------
// Fale com a gente
// ---------------------------------------------------------------------------

/** Só o WhatsApp que o dono marcou como público (AC-422). */
export function FaleComAGente({
  whatsapp,
  nome,
}: {
  readonly whatsapp: string | null;
  readonly nome: string;
}) {
  if (!whatsapp) return null;
  const digitos = numeroDoWhatsApp(whatsapp);
  if (digitos === "") return null;

  return (
    <CartaoDaSecao
      id="sobre-contato"
      titulo="Fale com a gente"
      icone={<IconeConversa />}
    >
      <p className="sc-sobre__nota">
        Dúvida sobre um produto ou um pedido? Fale direto com {nome}.
      </p>
      <a
        className="sc-sobre__whatsapp"
        href={`https://wa.me/${digitos}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <IconeConversa aria-hidden="true" />
        <span>
          Conversar no WhatsApp
          <span className="sc-sobre__whatsapp-numero">
            {telefoneLegivel(whatsapp)}
          </span>
        </span>
        <span className="sc-so-leitor"> (abre em outra aba)</span>
      </a>
    </CartaoDaSecao>
  );
}
