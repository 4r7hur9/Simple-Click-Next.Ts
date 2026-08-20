/**
 * A apresentação da loja (AC-400, AC-401).
 *
 * ESTE COMPONENTE NÃO ANIMA NADA, e isso é o desenho. Ele desenha a página
 * inteira, legível, com JavaScript desligado — que é o que o AC-415 exige e o
 * que torna a página encontrável no Google. A narrativa por rolagem entra por
 * cima, num componente separado que só existe no navegador, e some sem deixar
 * buraco quando não roda.
 *
 * A ordem das seções é o argumento: quem é a loja, se dá para pedir agora, e o
 * caminho para o cardápio. Trocar a ordem não é reorganizar — é contar outra
 * história, e a pessoa que chegou com fome sai sem saber se pode pedir.
 */
import { Aviso, Cartao } from "@simpleclick/ui";

/** A loja, como o contrato da API a descreve. */
export interface LojaNaTela {
  readonly apelido: string;
  readonly nome: string;
  readonly boasVindas: string | null;
  readonly logo: string | null;
  readonly capa: string | null;
  readonly formasDeEntrega: readonly string[];
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
  /** Para onde vai quem quer ver o cardápio. */
  readonly linkDoCardapio: string;
}

const NOME_DA_ENTREGA: Record<string, string> = {
  DELIVERY: "Entrega",
  PICKUP: "Retirada no local",
};

/** Junta as partes do endereço numa linha, sem vírgula sobrando. */
function enderecoEmUmaLinha(
  endereco: NonNullable<LojaNaTela["enderecoParaRetirada"]>,
): string {
  const rua = [endereco.logradouro, endereco.numero].filter(Boolean).join(", ");
  const cidade = [endereco.cidade, endereco.uf].filter(Boolean).join("/");
  return [rua, endereco.complemento, endereco.bairro, cidade]
    .filter(Boolean)
    .join(" · ");
}

/**
 * O aviso de aberta ou fechada.
 *
 * Fechada NÃO impede navegar (AC-401): a pessoa continua vendo o cardápio e
 * decide voltar. Esconder o cardápio da loja fechada faria ela perder o cliente
 * que ia pedir amanhã.
 */
function SituacaoDaLoja({ abertura }: { readonly abertura: AberturaNaTela }) {
  if (abertura.aberta) {
    return (
      <Aviso tom="sucesso" aoVivo={false} titulo="Aberta agora">
        Você já pode fazer seu pedido.
      </Aviso>
    );
  }

  const explicacao =
    abertura.motivo === "EXCECAO" && abertura.explicacaoDaExcecao
      ? abertura.explicacaoDaExcecao
      : null;

  return (
    <Aviso tom="atencao" aoVivo={false} titulo="Fechada agora">
      {explicacao ? `${explicacao}. ` : ""}
      {abertura.proximaAbertura
        ? `A loja ${abertura.proximaAbertura}.`
        : "A loja ainda não informou o próximo horário."}{" "}
      Você pode ver o cardápio e voltar depois.
    </Aviso>
  );
}

export function ApresentacaoDaLoja({
  loja,
  abertura,
  linkDoCardapio,
}: ApresentacaoDaLojaProps) {
  return (
    <article className="sc-loja" data-narrativa="apresentacao">
      {/*
        Primeira seção: quem é a loja. É o que a pessoa foi buscar ao abrir o
        endereço, e por isso vem sem nada antes dela.
      */}
      <section className="sc-secao sc-loja__capa" data-secao="quem">
        <div className="sc-secao__conteudo">
          {loja.logo ? (
            // A dimensão vai na marcação para o espaço já estar reservado e a
            // página não pular quando a imagem carregar (AC-416).
            <img
              className="sc-loja__logo"
              src={loja.logo}
              alt=""
              width={120}
              height={120}
              loading="eager"
            />
          ) : null}

          <h1 className="sc-secao__titulo">{loja.nome}</h1>

          {loja.boasVindas ? (
            <p className="sc-secao__texto sc-loja__boas-vindas">
              {loja.boasVindas}
            </p>
          ) : null}

          <SituacaoDaLoja abertura={abertura} />

          {/*
            Um link de verdade, e não um botão que navega por script: ele
            funciona com JavaScript desligado, abre em nova aba com o gesto do
            teclado, e o buscador o segue.
          */}
          <p className="sc-loja__chamada">
            <a className="sc-botao sc-botao--primaria" href={linkDoCardapio}>
              Ver o cardápio
            </a>
          </p>
        </div>
      </section>

      {/* Segunda seção: como receber. Só existe se a loja disse alguma coisa. */}
      {loja.formasDeEntrega.length > 0 || loja.enderecoParaRetirada ? (
        <section className="sc-secao sc-loja__como" data-secao="como">
          <div className="sc-secao__conteudo">
            <Cartao titulo="Como você recebe" nivelDoTitulo={2}>
              {loja.formasDeEntrega.length > 0 ? (
                <ul className="sc-loja__formas">
                  {loja.formasDeEntrega.map((forma) => (
                    <li key={forma}>{NOME_DA_ENTREGA[forma] ?? forma}</li>
                  ))}
                </ul>
              ) : null}

              {loja.enderecoParaRetirada ? (
                <address className="sc-loja__endereco">
                  {enderecoEmUmaLinha(loja.enderecoParaRetirada)}
                </address>
              ) : null}
            </Cartao>
          </div>
        </section>
      ) : null}

      {/*
        Terceira seção: o caminho de saída. Quem rolou até aqui já decidiu, e
        obrigá-lo a voltar ao topo para achar o botão é atrito no pior momento.
      */}
      <section className="sc-secao sc-loja__saida" data-secao="cardapio">
        <div className="sc-secao__conteudo">
          <h2 className="sc-secao__titulo">Pronto para pedir?</h2>
          <p className="sc-secao__texto">
            O cardápio de {loja.nome} está a um toque.
          </p>
          <p className="sc-loja__chamada">
            <a className="sc-botao sc-botao--primaria" href={linkDoCardapio}>
              Ver o cardápio
            </a>
          </p>
        </div>
      </section>
    </article>
  );
}
