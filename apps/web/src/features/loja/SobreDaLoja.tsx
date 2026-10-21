/**
 * "Sobre a loja" (AC-421, AC-422, AC-423): uma JANELA por cima da página da
 * loja, e não uma página à parte.
 *
 * Quem lê o Sobre está decidindo se pede — tirá-lo da loja para uma página
 * nova o afastava do cardápio. Na janela, fechar devolve a pessoa exatamente
 * onde estava, com o "Ver o cardápio" a um toque.
 *
 * O CONTEÚDO É DO SERVIDOR, sem script: só a casca (`JanelaDoSobre`) roda no
 * navegador, para abrir e fechar. O endereço `/loja/<loja>/sobre` continua
 * existindo — é a mesma loja com a janela já aberta —, e é por ele que o link
 * se compartilha e o buscador lê o texto.
 */
import type { CSSProperties } from "react";
import { TemaDaMarca } from "@simpleclick/ui";

import { capaPadraoDe } from "../../lib/capa-padrao.ts";
import { iniciaisDe } from "../../lib/iniciais.ts";
import {
  COR_DE_DESTAQUE_PADRAO,
  type TemaNaTela,
} from "./ApresentacaoDaLoja.tsx";
import { diaDaSemanaNoFuso, type EnderecoNaTela } from "./sobre/formatos.ts";
import { JanelaDoSobre } from "./sobre/JanelaDoSobre.tsx";
import {
  ComoReceber,
  FaleComAGente,
  FormasDePagamento,
  HorariosDaLoja,
  NossaHistoria,
  OndeEstamos,
  SeloDaSituacao,
  type AberturaDoSobre,
  type EntregaNaTela,
  type HorarioNaTela,
} from "./sobre/SecoesDoSobre.tsx";

export interface DadosSobreDaLoja {
  readonly apelido: string;
  readonly nome: string;
  /** O código do ramo, para a capa padrão quando o dono não enviou a dele. */
  readonly ramo?: string | null | undefined;
  readonly boasVindas?: string | null | undefined;
  readonly sobre: string | null;
  readonly logo: string | null;
  readonly capa: string | null;
  readonly cores?: Readonly<Record<string, string>> | null | undefined;
  readonly tema?: TemaNaTela | null | undefined;
  readonly enderecoParaRetirada: EnderecoNaTela | null;
  readonly whatsappPublico: string | null;
  readonly formasDeEntrega?: readonly string[] | undefined;
  readonly fusoHorario?: string | undefined;
}

/** O que o fechamento da loja diz, SEM a chave PIX. */
export interface RecebimentoDaLoja {
  readonly formasDePagamento: readonly string[];
  readonly entrega: EntregaNaTela;
}

export interface SobreDaLojaProps {
  readonly loja: DadosSobreDaLoja;
  readonly abertura: AberturaDoSobre;
  /** A grade da semana; nula quando a API não a mandou. */
  readonly horario?: HorarioNaTela | null | undefined;
  /** Pagamento e entrega; nulo quando o fechamento não respondeu. */
  readonly recebimento?: RecebimentoDaLoja | null | undefined;
  /** "Cardápio", "Catálogo" — a palavra do ramo. */
  readonly rotuloDoCatalogo?: string | undefined;
  /** Nasce aberta: é a rota `/sobre`. */
  readonly aberta: boolean;
  /** O instante, para a prova fixar o dia de hoje. */
  readonly agora?: Date | undefined;
}

const ID_DO_TITULO = "sobre-da-loja-titulo";

export function SobreDaLoja({
  loja,
  abertura,
  horario = null,
  recebimento = null,
  rotuloDoCatalogo = "Cardápio",
  aberta,
  agora = new Date(),
}: SobreDaLojaProps) {
  const hoje = diaDaSemanaNoFuso(
    agora,
    loja.fusoHorario ?? "America/Sao_Paulo",
  );
  const catalogo = rotuloDoCatalogo.toLowerCase();
  // A foto de fundo da vitrine que o dono escolheu manda; depois a capa dele.
  const fundo = loja.tema?.fundoVitrine ?? loja.capa;

  return (
    <TemaDaMarca corDestaque={loja.tema?.corDestaque ?? COR_DE_DESTAQUE_PADRAO}>
      <JanelaDoSobre
        apelido={loja.apelido}
        aberta={aberta}
        idDoTitulo={ID_DO_TITULO}
      >
        <header
          className={`sc-sobre__hero ${
            fundo ? "sc-sobre__hero--com-capa" : "sc-sobre__hero--padrao"
          }`}
        >
          {fundo ? (
            <>
              {/* A capa é ambiente: o nome da loja já está no título. */}
              <img
                className="sc-sobre__fundo"
                src={fundo}
                alt=""
                width={1200}
                height={480}
                loading="lazy"
              />
              <span className="sc-sobre__veu" aria-hidden="true" />
            </>
          ) : (
            <span
              className="sc-sobre__padrao"
              style={
                {
                  "--capa-url": `url(${capaPadraoDe(loja.ramo)})`,
                } as CSSProperties
              }
              aria-hidden="true"
            />
          )}

          <div className="sc-sobre__identidade">
            <span className="sc-loja__marca sc-sobre__marca">
              {loja.logo ? (
                <img
                  className="sc-loja__logo"
                  src={loja.logo}
                  alt=""
                  width={72}
                  height={72}
                  loading="lazy"
                />
              ) : (
                <span className="sc-loja__iniciais" aria-hidden="true">
                  {iniciaisDe(loja.nome)}
                </span>
              )}
            </span>
            <div className="sc-sobre__nome-bloco">
              <p className="sc-sobre__sobrelinha">Sobre a loja</p>
              <h2 id={ID_DO_TITULO} className="sc-sobre__nome">
                <span className="sc-marcador">{loja.nome}</span>
              </h2>
            </div>
          </div>

          {loja.boasVindas ? (
            <p className="sc-sobre__boas-vindas">{loja.boasVindas}</p>
          ) : null}

          <div className="sc-sobre__acoes">
            <SeloDaSituacao abertura={abertura} />
            <a
              className="sc-sobre__cardapio"
              href={`/loja/${loja.apelido}/cardapio`}
            >
              Ver o {catalogo}
              <svg
                viewBox="0 0 20 20"
                width="18"
                height="18"
                aria-hidden="true"
              >
                <path
                  d="M4 10h11M11 5l5 5-5 5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
          </div>
        </header>

        <div className="sc-sobre__grade">
          {loja.sobre ? (
            <NossaHistoria texto={loja.sobre} />
          ) : (
            <p className="sc-sobre__sem-historia">
              Esta loja ainda não contou a história dela por aqui. Os horários,
              a entrega e o contato estão logo abaixo.
            </p>
          )}
          <HorariosDaLoja horario={horario} abertura={abertura} hoje={hoje} />
          <ComoReceber
            formasDeEntrega={loja.formasDeEntrega ?? []}
            entrega={recebimento?.entrega ?? null}
            endereco={loja.enderecoParaRetirada}
          />
          <FormasDePagamento formas={recebimento?.formasDePagamento ?? []} />
          <OndeEstamos endereco={loja.enderecoParaRetirada} />
          <FaleComAGente whatsapp={loja.whatsappPublico} nome={loja.nome} />
        </div>

        <footer className="sc-sobre__rodape">
          <p>Pronto para pedir?</p>
          <a
            className="sc-sobre__cardapio"
            href={`/loja/${loja.apelido}/cardapio`}
          >
            Ver o {catalogo}
          </a>
        </footer>
      </JanelaDoSobre>
    </TemaDaMarca>
  );
}
