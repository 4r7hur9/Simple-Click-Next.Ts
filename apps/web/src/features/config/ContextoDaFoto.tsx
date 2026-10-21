/**
 * O lugar onde cada foto da loja aparece, desenhado POR CIMA da foto no
 * "Como vai aparecer" do modal de ajuste (card #36).
 *
 * Em vez da foto solta, a prévia mostra o que o cliente vê: no fundo da
 * vitrine, o cartão de apresentação (logo, selo Aberto, nome da loja, boas-vindas,
 * botão) sob o véu; no topo do cardápio, a faixa com o nome, "Cardápio ·
 * Aberto" e o "i" do Sobre. A peça é desenhada NO TAMANHO REAL da tela do
 * cliente e encolhida para caber (as medidas moram em `contexto-da-foto.css`,
 * a mesma letra do nome da vitrine pública), então a foto e o texto ficam na
 * proporção certa — e o dono vê se o rosto ou o produto vai ficar atrás da letra.
 */
import type { CSSProperties, ReactNode } from "react";
import { TemaDaMarca } from "@simpleclick/ui";

import { iniciaisDe } from "../../lib/iniciais.ts";

export type LugarDaFoto = "vitrine" | "cardapio";
export type TelaDaFoto = "computador" | "celular";

export interface DadosDoContexto {
  readonly nome: string;
  readonly logo: string;
  readonly boasVindas: string;
  /** Como a loja chama o catálogo: "Cardápio", "Catálogo". */
  readonly rotuloDoCatalogo: string;
  readonly corDestaque: string;
}

/**
 * A largura da tela do cliente que cada prévia imita (px) e o respiro do
 * cartão. Vêm do CSS da vitrine: cartão de 1168 px no notebook de 1440 px,
 * de 358 px no celular de 390 px; faixa do cardápio de 1104 px e 366 px.
 */
const TELA_IMITADA: Record<TelaDaFoto, number> = {
  computador: 1440,
  celular: 390,
};

const RESPIRO: Record<LugarDaFoto, Record<TelaDaFoto, string>> = {
  vitrine: { computador: "4rem", celular: "2rem" },
  cardapio: { computador: "3rem", celular: "2rem 1rem" },
};

const FOLGA_DO_NOME: Record<LugarDaFoto, Record<TelaDaFoto, string>> = {
  vitrine: { computador: "8rem", celular: "4rem" },
  cardapio: { computador: "2rem", celular: "2rem" },
};

function Selo() {
  return (
    <span className="sc-ctx__selo">
      <span className="sc-ctx__led" />
      Aberto
    </span>
  );
}

function Nome({ nome }: { readonly nome: string }) {
  return (
    <p className="sc-ctx__nome">
      <span className="sc-ctx__marcador">{nome}</span>
    </p>
  );
}

function Cartao({
  dados,
  nome,
}: {
  readonly dados: DadosDoContexto;
  readonly nome: string;
}) {
  return (
    <>
      <span className="sc-ctx__veu-cartao" />
      <div className="sc-ctx__identidade">
        <div className="sc-ctx__topo">
          {dados.logo === "" ? (
            <span className="sc-ctx__logo sc-ctx__logo--iniciais">
              {iniciaisDe(nome)}
            </span>
          ) : (
            <span className="sc-ctx__logo">
              <img src={dados.logo} alt="" />
            </span>
          )}
          <Selo />
        </div>
        <Nome nome={nome} />
        {dados.boasVindas.trim() === "" ? null : (
          <p className="sc-ctx__boas-vindas">{dados.boasVindas}</p>
        )}
      </div>
      <div className="sc-ctx__base">
        <span className="sc-ctx__entrar">
          Ver o {dados.rotuloDoCatalogo.toLowerCase()}
        </span>
        <div className="sc-ctx__fichas">
          <span className="sc-ctx__ficha">
            <b>Como receber</b>
            Retirada ou entrega
          </span>
          <span className="sc-ctx__ficha">
            <b>Horário</b>
            Aberto agora
          </span>
        </div>
      </div>
    </>
  );
}

function Faixa({
  dados,
  nome,
}: {
  readonly dados: DadosDoContexto;
  readonly nome: string;
}) {
  return (
    <>
      <span className="sc-ctx__veu-faixa" />
      <span className="sc-ctx__info">i</span>
      <div className="sc-ctx__conteudo">
        <Nome nome={nome} />
        <div className="sc-ctx__pagina">
          <p className="sc-ctx__titulo">{dados.rotuloDoCatalogo}</p>
          <Selo />
        </div>
      </div>
    </>
  );
}

function ContextoDaFoto({
  lugar,
  tela,
  larguraDaTela,
  dados,
  quadro,
}: {
  readonly lugar: LugarDaFoto;
  readonly tela: TelaDaFoto;
  readonly larguraDaTela: number;
  readonly dados: DadosDoContexto;
  readonly quadro: { readonly largura: number; readonly altura: number };
}) {
  const nome =
    dados.nome.trim() === "" ? "Nome da sua loja" : dados.nome.trim();
  const escala = quadro.largura / larguraDaTela;
  const estilo = {
    width: larguraDaTela,
    height: quadro.altura / escala,
    transform: `scale(${String(escala)})`,
    "--ctx-tela": String(TELA_IMITADA[tela]),
    "--ctx-respiro": RESPIRO[lugar][tela],
    "--ctx-folga": FOLGA_DO_NOME[lugar][tela],
    "--letras-do-nome": String(nome.length),
  } as CSSProperties;
  return (
    <TemaDaMarca corDestaque={dados.corDestaque}>
      <div
        className={`sc-ctx sc-ctx--${lugar === "vitrine" ? "cartao" : "faixa"} sc-ctx--${tela}`}
        style={estilo}
        data-contexto={lugar}
        data-tela={tela}
      >
        {lugar === "vitrine" ? (
          <Cartao dados={dados} nome={nome} />
        ) : (
          <Faixa dados={dados} nome={nome} />
        )}
      </div>
    </TemaDaMarca>
  );
}

/**
 * A função que o recortador chama com o tamanho do quadro da prévia e que
 * devolve o contexto por cima da foto.
 */
export function sobreposicaoDoContexto(
  lugar: LugarDaFoto,
  tela: TelaDaFoto,
  larguraDaTela: number,
  dados: DadosDoContexto,
): (quadro: {
  readonly largura: number;
  readonly altura: number;
}) => ReactNode {
  return (quadro) => (
    <ContextoDaFoto
      lugar={lugar}
      tela={tela}
      larguraDaTela={larguraDaTela}
      dados={dados}
      quadro={quadro}
    />
  );
}
