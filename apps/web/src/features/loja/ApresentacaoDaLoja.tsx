/**
 * A apresentação da loja no layout do Stitch (cards #107 e #129).
 *
 * O QUE ESTÁ NA TELA, de cima para baixo, como a referência:
 *
 * 1. O CARTÃO DA LOJA: a capa como faixa curta com um degradê escuro embaixo,
 *    a situação ("Aberta agora") como etiqueta no canto, o logo quadrado
 *    sobreposto à capa, o nome ao lado e, na mesma linha, Favoritar,
 *    Compartilhar e WhatsApp. Sem foto do dono, um degradê neutro.
 * 2. A faixa com a descrição curta (as boas-vindas ou o começo do Sobre).
 * 3. O botão do catálogo, de largura total, no verde SimpleClick.
 * 4. As condições (entrega, endereço, pagamento), cada uma em seu cartão.
 *
 * Só dado real da loja: bloco sem dado some. Nada de nota, selo, parcela nem
 * número inventado.
 *
 * ESTE COMPONENTE NÃO ANIMA NADA. Ele desenha a página inteira, legível, com
 * JavaScript desligado — que é o que o AC-415 exige e o que a torna encontrável.
 */
import {
  IconeConversa,
  IconeEstoque,
  IconeAvancar,
  IconeInfo,
  TemaDaMarca,
  type PreferenciaDoSelo,
} from "@simpleclick/ui";

import { iniciaisDe } from "../../lib/iniciais.ts";
import { BotaoFavoritar } from "../feed/BotaoFavoritar.tsx";
import { atributosDoSelo } from "../vitrine/SeloDeStatus.tsx";
import { BotaoCompartilharLoja } from "./BotaoCompartilharLoja.tsx";
import { textoDaContagem } from "./contagem-de-itens.ts";
import { CondicoesDaLoja } from "./CondicoesDaLoja.tsx";
import { FotoDaLoja } from "./FotoDaLoja.tsx";
import type { RecebimentoDaLoja } from "./SobreDaLoja.tsx";
import { numeroDoWhatsApp } from "./sobre/formatos.ts";

/** O tema da loja: as fotos (a cor de destaque é sempre o verde SimpleClick) que o dono escolheu. */
export interface TemaNaTela {
  readonly corDestaque: string;
  readonly fundoVitrine: string | null;
  readonly topoCardapio: string | null;
  /** As versões das fotos para o celular (telas estreitas); nulas: vale a do computador. */
  readonly fundoVitrineCelular?: string | null | undefined;
  readonly topoCardapioCelular?: string | null | undefined;
  /** O selo ABERTO/FECHADO sobre a capa (card #64); padrão automático. */
  readonly seloDeStatus?: PreferenciaDoSelo | undefined;
  /** A cor medida de cada imagem, pelo endereço. */
  readonly coresDasImagens?: Readonly<Record<string, string>> | undefined;
}

/** A loja, como o contrato da API a descreve. */
export interface LojaNaTela {
  readonly apelido: string;
  readonly nome: string;
  /**
   * O código do tipo de negócio (`vertical_code`). A vitrine não desenha mais
   * a capa padrão do ramo (card #129), mas o campo continua no contrato.
   */
  readonly ramo?: string | null | undefined;
  readonly boasVindas: string | null;
  /** O texto "Sobre" da loja; aqui vai resumido, a janela do Sobre traz inteiro. */
  readonly sobre?: string | null | undefined;
  readonly logo: string | null;
  readonly capa: string | null;
  readonly formasDeEntrega: readonly string[];
  readonly cores?: Readonly<Record<string, string>> | null | undefined;
  readonly tema?: TemaNaTela | null | undefined;
  readonly enderecoParaRetirada: {
    readonly logradouro: string | null;
    readonly numero: string | null;
    readonly complemento: string | null;
    readonly bairro: string | null;
    readonly cidade: string | null;
    readonly uf: string | null;
  } | null;
}

/** Se está aberta agora, e quando volta a abrir. */
export interface AberturaNaTela {
  readonly aberta: boolean;
  readonly proximaAbertura: string | null;
  readonly motivo: string;
  readonly explicacaoDaExcecao?: string | null | undefined;
}

export interface ApresentacaoDaLojaProps {
  readonly loja: LojaNaTela;
  readonly abertura: AberturaNaTela;
  /** Para onde vai quem quer ver o catálogo. */
  readonly linkDoCardapio: string;
  /**
   * A palavra do RAMO para o catálogo — "Cardápio", "Catálogo".
   *
   * LOJA DE ROUPA NÃO TEM CARDÁPIO. O botão que diz "Ver o cardápio" acerta na
   * lanchonete e erra na loja de roupas, e é o botão principal da tela.
   */
  readonly rotuloDoCatalogo: string;
  /**
   * Quantos itens a loja tem à venda, quando o número é exato (card #107).
   * Nulo ou ausente: o botão mostra só o texto.
   */
  readonly contagemDeItens?: number | null | undefined;
  /**
   * Favoritar a loja junto da identidade. Sem ele, não há o botão. Nunca
   * mostra quantas pessoas favoritaram.
   */
  readonly favoritar?:
    { readonly logado: boolean; readonly favorita: boolean } | undefined;
  /** O WhatsApp que o dono marcou como público; sem ele, não há o botão. */
  readonly whatsappPublico?: string | null | undefined;
  /** Mostra o "Compartilhar a loja" (só aparece com JavaScript). */
  readonly compartilhar?: boolean | undefined;
  /** Pagamento e entrega, SEM a chave PIX; alimenta o cartão de pagamento. */
  readonly recebimento?: RecebimentoDaLoja | null | undefined;
}

/**
 * A situação da loja, como uma etiqueta no canto da capa, e não como uma caixa
 * de aviso: "Aberta agora" não interrompe, é um dado da loja.
 */
function SituacaoDaLoja({
  abertura,
  seloDeStatus,
  corDoFundo,
}: {
  readonly abertura: AberturaNaTela;
  readonly seloDeStatus: PreferenciaDoSelo | null | undefined;
  readonly corDoFundo: string | null;
}) {
  const selo = atributosDoSelo({
    preferencia: seloDeStatus,
    corDoFundo,
    aberta: abertura.aberta,
  });
  const explicacao =
    abertura.motivo === "EXCECAO" && abertura.explicacaoDaExcecao
      ? abertura.explicacaoDaExcecao
      : null;

  return (
    <p
      className={`sc-loja__situacao sc-loja__situacao--${
        abertura.aberta ? "aberta" : "fechada"
      } ${selo.className}`}
      style={selo.style}
      data-selo={selo["data-selo"]}
    >
      {/* O ponto é decoração: quem ouve a página recebe o texto ao lado. */}
      <span className="sc-loja__pulso" aria-hidden="true" />
      <span className="sc-loja__situacao-texto">
        {abertura.aberta ? (
          "Aberta agora"
        ) : (
          <>
            {explicacao ? `${explicacao} · ` : "Fechada agora · "}
            {abertura.proximaAbertura ?? "horário não informado"}
          </>
        )}
      </span>
    </p>
  );
}

export function ApresentacaoDaLoja({
  loja,
  abertura,
  linkDoCardapio,
  rotuloDoCatalogo,
  contagemDeItens = null,
  favoritar,
  whatsappPublico = null,
  compartilhar = false,
  recebimento = null,
}: ApresentacaoDaLojaProps) {
  const digitosDoWhatsApp =
    whatsappPublico === null ? "" : numeroDoWhatsApp(whatsappPublico);
  const temAcoes =
    favoritar !== undefined || digitosDoWhatsApp !== "" || compartilhar;
  // A foto de fundo da vitrine que o dono escolheu manda; depois a capa dele.
  const fundo = loja.tema?.fundoVitrine ?? loja.capa;
  // A versão do celular só vale junto da foto de fundo do tema (a capa antiga
  // não tem versão própria).
  const fundoCelular = loja.tema?.fundoVitrine
    ? (loja.tema.fundoVitrineCelular ?? null)
    : null;
  // A descrição curta: as boas-vindas; sem elas, o começo do Sobre.
  const descricao = loja.boasVindas ?? loja.sobre ?? null;
  const catalogo = rotuloDoCatalogo.toLowerCase();

  return (
    <TemaDaMarca className="sc-loja">
      <div data-narrativa="apresentacao">
        <section className="sc-loja__tela" data-secao="loja">
          <div
            className={`sc-loja__painel ${
              fundo ? "sc-loja__painel--com-capa" : "sc-loja__painel--padrao"
            }`}
          >
            {/* A capa é ambiente: o nome da loja já está no título. */}
            <div className="sc-loja__capa">
              {fundo ? (
                <FotoDaLoja
                  className="sc-loja__fundo"
                  src={fundo}
                  celular={fundoCelular}
                  width={1600}
                  height={1200}
                  loading="eager"
                />
              ) : null}
              <span className="sc-loja__veu" aria-hidden="true" />
              <SituacaoDaLoja
                abertura={abertura}
                seloDeStatus={loja.tema?.seloDeStatus}
                corDoFundo={
                  fundo ? (loja.tema?.coresDasImagens?.[fundo] ?? null) : null
                }
              />
            </div>

            <header className="sc-loja__identidade">
              <span className="sc-loja__marca">
                {loja.logo ? (
                  // A dimensão vai na marcação para o espaço já estar
                  // reservado e a página não pular (AC-416).
                  <img
                    className="sc-loja__logo"
                    src={loja.logo}
                    alt=""
                    width={88}
                    height={88}
                    loading="eager"
                  />
                ) : (
                  <span className="sc-loja__iniciais" aria-hidden="true">
                    {iniciaisDe(loja.nome)}
                  </span>
                )}
              </span>

              <h1 className="sc-loja__nome">{loja.nome}</h1>

              {temAcoes ? (
                <div className="sc-loja__acoes">
                  {favoritar ? (
                    <BotaoFavoritar
                      apelido={loja.apelido}
                      nome={loja.nome}
                      favorita={favoritar.favorita}
                      logado={favoritar.logado}
                      voltarPara={`/loja/${loja.apelido}`}
                      variante="seguir"
                    />
                  ) : null}
                  {compartilhar ? (
                    <BotaoCompartilharLoja
                      apelido={loja.apelido}
                      nome={loja.nome}
                    />
                  ) : null}
                  {digitosDoWhatsApp !== "" ? (
                    <a
                      className="sc-loja__acao sc-loja__acao--whatsapp"
                      href={`https://wa.me/${digitosDoWhatsApp}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Fale com a loja no WhatsApp (abre em outra aba)"
                    >
                      <IconeConversa aria-hidden="true" />
                      <span aria-hidden="true">WhatsApp</span>
                    </a>
                  ) : null}
                </div>
              ) : null}
            </header>

            {descricao ? (
              <div className="sc-loja__descricao">
                <span className="sc-loja__descricao-icone" aria-hidden="true">
                  <IconeInfo />
                </span>
                <div className="sc-loja__descricao-corpo">
                  <p
                    className={
                      loja.boasVindas
                        ? "sc-loja__boas-vindas"
                        : "sc-loja__descricao-texto"
                    }
                  >
                    {descricao}
                  </p>
                  {loja.sobre ? (
                    // Abre a JANELA do Sobre (o ouvinte mora em `JanelaDoSobre`);
                    // sem script, é um link comum para a mesma loja.
                    <a
                      className="sc-loja__ler-mais"
                      href={`/loja/${loja.apelido}/sobre`}
                      data-abre-sobre=""
                    >
                      Ler mais sobre a loja
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/*
              O caminho para o catálogo é um link de verdade, e não um botão que
              navega por script: funciona com JavaScript desligado, abre em nova
              aba pelo teclado, e o buscador o segue.
            */}
            <p className="sc-loja__chamada">
              <a className="sc-loja__entrar" href={linkDoCardapio}>
                <span className="sc-loja__entrar-rotulo">
                  <IconeEstoque aria-hidden="true" />
                  <span>
                    Ver o {catalogo} completo
                    {contagemDeItens !== null && contagemDeItens > 0 ? (
                      <span className="sc-loja__entrar-contagem">
                        {" "}
                        ({textoDaContagem(contagemDeItens)})
                      </span>
                    ) : null}
                  </span>
                </span>
                <span className="sc-loja__entrar-explorar" aria-hidden="true">
                  Explorar
                  <IconeAvancar className="sc-loja__seta" />
                </span>
              </a>
              {!abertura.aberta ? (
                <span className="sc-loja__nota">
                  Você pode ver o {catalogo} e voltar depois.
                </span>
              ) : null}
            </p>
          </div>

          <CondicoesDaLoja
            apelido={loja.apelido}
            formasDeEntrega={loja.formasDeEntrega}
            endereco={loja.enderecoParaRetirada}
            recebimento={recebimento}
          />
        </section>
      </div>
    </TemaDaMarca>
  );
}
