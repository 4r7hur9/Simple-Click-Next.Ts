"use client";
/**
 * O fechamento do pedido, do carrinho até o pedido criado (AC-503 a AC-512).
 *
 * É COMPONENTE DE NAVEGADOR, e não de servidor, por um motivo que não é de
 * gosto: o carrinho é identificado por um COOKIE que a API emitiu no domínio
 * dela. O servidor do Next não tem esse cookie — se ele fizesse a chamada, o
 * carrinho seria dele, e todos os visitantes dividiriam o mesmo. É a falha que
 * a migração 0012 corrigiu no banco, e ela voltaria pela porta da frente.
 *
 * O que é do SERVIDOR nesta página continua no servidor: o nome da loja, a cor,
 * as formas de pagamento e a configuração de entrega chegam prontos por
 * propriedade, desenhados antes de qualquer script.
 *
 * OS VALORES SÃO SEMPRE OS DO SERVIDOR. A tela mostra o que a conferência
 * devolveu; o que ela envia de volta é só referência para o registro. Ler preço
 * do que o navegador guarda é o que permite fechar um pedido de mil reais por
 * um (P-006).
 *
 * A ORDEM DA TELA segue a ordem da decisão: o que vou pagar, como recebo, quem
 * sou, como pago. Pedir o endereço antes de a pessoa saber o total é pedir
 * trabalho antes de dar motivo.
 */
import { useCallback, useEffect, useState } from "react";

import {
  conferirCarrinho,
  criarPedido,
  registrarCliqueNoWhatsApp,
  type ConferenciaNaTela,
  type PedidoNaTela,
} from "../../lib/carrinho-do-navegador.ts";
import { escreverDinheiro } from "../../lib/produto.ts";

import { AvisoDeMudanca, type MudancaNaTela } from "./AvisoDeMudanca.tsx";
import { CaixaPix } from "./CaixaPix.tsx";
import { EnvioWhatsApp } from "./EnvioWhatsApp.tsx";
import {
  FormularioCheckout,
  type EnvioDoFechamento,
  type FormasDaLoja,
} from "./FormularioCheckout.tsx";
import { ResumoDoPedido, type LinhaDoResumo } from "./ResumoDoPedido.tsx";
import {
  SeletorDePagamento,
  type FormaParaEscolher,
} from "./SeletorDePagamento.tsx";

/** A chave PIX da loja, quando ela aceita PIX. */
export interface PixDaLoja {
  readonly chave: string;
  readonly tipo: string | null;
  readonly titular: string | null;
}

/** O que a loja cobra pela entrega. */
export interface EntregaDaLojaNaTela {
  readonly taxaCentavos: number | null;
  readonly nomeDaTaxa: string | null;
  readonly gratisAcimaDeCentavos: number | null;
  readonly minimoParaEntregaCentavos: number | null;
}

export interface FechamentoDaCompraProps {
  readonly apelidoDaLoja: string;
  readonly formas: FormasDaLoja;
  readonly formasDePagamento: readonly string[];
  readonly pix: PixDaLoja | null;
  readonly entrega: EntregaDaLojaNaTela;
  readonly linkDoCatalogo: string;
  /** Como a loja chama o catálogo — "cardápio" ou "catálogo". */
  readonly rotuloDoCatalogo: string;
  /** Trocáveis para a prova responder sem rede. */
  readonly conferir?: typeof conferirCarrinho | undefined;
  readonly fechar?: typeof criarPedido | undefined;
}

/** Os rótulos das formas de pagamento que a versão 1 conhece. */
const ROTULO_DO_PAGAMENTO: Record<string, string> = {
  PIX: "PIX",
  CASH: "Dinheiro na entrega",
  CARD_ON_DELIVERY: "Cartão na entrega",
};

/** Só a forma em dinheiro pergunta troco (AC-512). */
const PERGUNTA_TROCO = new Set(["CASH"]);

/**
 * Uma chave nova por TENTATIVA de fechar, e não por pedido.
 *
 * É o que faz o segundo toque no botão reencontrar o primeiro pedido em vez de
 * criar outro (AC-516). Ela só é trocada quando a pessoa muda algo e tenta de
 * novo — aí é outra tentativa, e outro pedido é o certo.
 */
function novaChave(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function FechamentoDaCompra({
  apelidoDaLoja,
  formas,
  formasDePagamento,
  pix,
  entrega,
  linkDoCatalogo,
  rotuloDoCatalogo,
  conferir = conferirCarrinho,
  fechar = criarPedido,
}: FechamentoDaCompraProps) {
  const [conferencia, setConferencia] = useState<ConferenciaNaTela | null>(
    null,
  );
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmouMudanca, setConfirmouMudanca] = useState(false);
  const [pagamento, setPagamento] = useState<string | null>(
    formasDePagamento[0] ?? null,
  );
  const [entregaEscolhida, setEntregaEscolhida] = useState<
    "DELIVERY" | "PICKUP"
  >(formas.aceitaEntrega ? "DELIVERY" : "PICKUP");
  const [enviando, setEnviando] = useState(false);
  const [pedido, setPedido] = useState<PedidoNaTela | null>(null);
  const [chave] = useState(novaChave);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const resultado = await conferir(apelidoDaLoja, null);
    if (resultado.estado === "conferido") {
      setConferencia(resultado.conferencia);
      setErro(null);
    } else {
      setErro("Não foi possível carregar seu carrinho agora.");
    }
    setCarregando(false);
  }, [apelidoDaLoja, conferir]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function enviar(dados: EnvioDoFechamento) {
    if (conferencia === null) return;

    setEnviando(true);
    setErro(null);
    try {
      const resultado = await fechar(apelidoDaLoja, {
        contato: {
          nome: dados.nome,
          telefone: dados.telefone,
          logradouro: dados.endereco?.logradouro ?? null,
          numero: dados.endereco?.numero ?? null,
          complemento: dados.endereco?.complemento ?? null,
          bairro: dados.endereco?.bairro ?? null,
          cidade: dados.endereco?.cidade ?? null,
          // O FORMULÁRIO NÃO PEDE UF, e o pedido tem coluna para ela. Não é
          // esquecimento do formulário: entrega de bairro não precisa de
          // estado, e todo campo a mais no celular é uma desistência a mais.
          // Fica nulo até alguém precisar — ver a dívida 77.
          estado: null,
          cep: dados.endereco?.cep ?? null,
        },
        entrega: dados.entrega,
        formaDePagamento: pagamento,
        trocoParaCentavos: null,
        observacao: dados.observacao === "" ? null : dados.observacao,
        chaveDeIdempotencia: chave,
        // Vai junto SÓ para a API anotar divergência. Ela recalcula com os
        // preços dela, e é o número dela que vale (P-006).
        totalVistoCentavos: totalNaTela,
      });

      if (resultado.estado === "criado") {
        setPedido(resultado.pedido);
        return;
      }

      setErro(
        resultado.estado === "nao-pode"
          ? resultado.motivo
          : "Não foi possível fechar o pedido agora. Tente de novo em instantes.",
      );
      // O mundo mudou desde que a página abriu: reconferir é o que mostra o
      // QUE mudou, em vez de deixar a pessoa adivinhar.
      void carregar();
    } finally {
      setEnviando(false);
    }
  }

  const subtotal = conferencia?.subtotalCentavos ?? 0;

  // A taxa é calculada aqui só para MOSTRAR. Quem cobra é o servidor, que
  // refaz a conta ao criar o pedido — e é o número dele que vale.
  const taxa = taxaDaEntrega(entrega, entregaEscolhida, subtotal);
  const totalNaTela = subtotal + taxa;

  const mudancas: readonly MudancaNaTela[] = (conferencia?.mudancas ?? []).map(
    (mudanca) => ({
      itemId: mudanca.itemId,
      tipo: mudanca.tipo as MudancaNaTela["tipo"],
      explicacao: mudanca.explicacao,
    }),
  );

  if (pedido !== null) {
    const acompanhamento = `/l/${apelidoDaLoja}/pedido/${pedido.tokenPublico}`;

    // O PEDIDO JÁ EXISTE, e é isso que a tela diz primeiro. O WhatsApp é o
    // passo seguinte, não a condição: se ele falhar, se a pessoa fechar a
    // janela ou se a loja não tiver número cadastrado, o pedido continua na
    // fila do dono e o código continua valendo (AC-523).
    if (pedido.whatsapp !== null) {
      return (
        <EnvioWhatsApp
          codigoDoPedido={pedido.codigo}
          enderecoDaConversa={pedido.whatsapp.endereco}
          textoDoPedido={pedido.whatsapp.texto}
          linkDeAcompanhamento={acompanhamento}
          aoAbrir={() =>
            registrarCliqueNoWhatsApp(apelidoDaLoja, pedido.tokenPublico).then(
              () => undefined,
            )
          }
        />
      );
    }

    return (
      <section className="sc-fechamento__pronto" aria-live="polite">
        <h2>Pedido {pedido.codigo} registrado</h2>
        <p>
          Guarde este código: é por ele que a loja encontra seu pedido. O total
          foi de <strong>{escreverDinheiro(pedido.totalCentavos)}</strong>.
        </p>
        <p>
          Esta loja não cadastrou WhatsApp para pedidos. Combine a entrega pelo
          canal de sempre, citando o código.
        </p>
        <p>
          <a className="sc-fechamento__acompanhar" href={acompanhamento}>
            Acompanhar o pedido
          </a>
        </p>
      </section>
    );
  }

  if (carregando) {
    return (
      <p className="sc-fechamento__estado" role="status" aria-live="polite">
        Carregando seu carrinho…
      </p>
    );
  }

  if (conferencia !== null && conferencia.itens.length === 0) {
    // Carrinho vazio NÃO é erro: é um estado legítimo, e o caminho de saída é
    // voltar ao catálogo — vazio sem saída é beco sem saída.
    return (
      <section className="sc-fechamento__estado">
        <p>Seu carrinho está vazio.</p>
        <p>
          <a href={linkDoCatalogo}>Ver o {rotuloDoCatalogo.toLowerCase()}</a>
        </p>
      </section>
    );
  }

  // A LOJA NÃO ENTREGA NEM DEIXA RETIRAR (AC-905): o dono desligou os dois
  // modos. Mostrar o formulário seria convidar a pessoa a preencher nome e
  // telefone para, no fim, ouvir que não dá — e a tela diria "retirar no
  // local", que a loja justamente desligou. O servidor recusa do mesmo jeito.
  if (!formas.aceitaEntrega && !formas.aceitaRetirada) {
    return (
      <section className="sc-fechamento__estado">
        <p role="alert">
          Esta loja não está recebendo pedidos agora: no momento ela não oferece
          entrega nem retirada.
        </p>
        <p>
          <a href={linkDoCatalogo}>
            Voltar ao {rotuloDoCatalogo.toLowerCase()}
          </a>
        </p>
      </section>
    );
  }

  // MUDOU O MUNDO DESDE QUE A PESSOA MONTOU O CARRINHO: ela confirma antes de
  // seguir. Preço que caiu também pede confirmação — o total deixou de ser o
  // que ela viu, e tela que muda número sem avisar ensina a desconfiar dele.
  if (
    conferencia !== null &&
    conferencia.precisaConfirmar &&
    !confirmouMudanca
  ) {
    return (
      <AvisoDeMudanca
        mudancas={mudancas}
        novoTotal={escreverDinheiro(totalNaTela)}
        aoConfirmar={() => setConfirmouMudanca(true)}
      />
    );
  }

  return (
    <div className="sc-fechamento">
      {erro === null ? null : (
        <p className="sc-fechamento__erro" role="alert">
          {erro}
        </p>
      )}

      <ResumoDoPedido
        linhas={linhasDoResumo(conferencia, entrega, taxa, entregaEscolhida)}
        rotuloDoTotal="Total"
        total={escreverDinheiro(totalNaTela)}
        impedimento={impedimento(entrega, entregaEscolhida, subtotal)}
      />

      {formasDePagamento.length === 0 ? null : (
        <SeletorDePagamento
          formas={formasParaEscolher(formasDePagamento)}
          escolhida={pagamento ?? undefined}
          aoEscolher={setPagamento}
          totalEmCentavos={totalNaTela}
        />
      )}

      {pagamento === "PIX" && pix !== null ? (
        <CaixaPix
          chave={pix.chave}
          tipoDaChave={pix.tipo}
          nomeDoRecebedor={pix.titular}
        />
      ) : null}

      <FormularioCheckout
        formas={formas}
        aoEnviar={(dados) => {
          setEntregaEscolhida(dados.entrega);
          void enviar(dados);
        }}
        enviando={enviando}
      />
    </div>
  );
}

/** As formas de pagamento, com o rótulo que a pessoa lê. */
function formasParaEscolher(
  formas: readonly string[],
): readonly FormaParaEscolher[] {
  return formas.map((forma) => ({
    forma,
    rotulo: ROTULO_DO_PAGAMENTO[forma] ?? forma,
    perguntaTroco: PERGUNTA_TROCO.has(forma),
  }));
}

/**
 * A taxa que a tela MOSTRA.
 *
 * A regra de verdade é a de `packages/core`, e quem a aplica é o servidor ao
 * criar o pedido. Aqui é a mesma decisão em miniatura, e ela existe só para o
 * resumo não ficar mudo até o envio — se as duas divergirem, vale a do
 * servidor, e a diferença aparece como divergência no registro.
 */
function taxaDaEntrega(
  entrega: EntregaDaLojaNaTela,
  forma: "DELIVERY" | "PICKUP",
  subtotal: number,
): number {
  if (forma === "PICKUP") return 0;
  if (entrega.taxaCentavos === null) return 0;
  if (
    entrega.gratisAcimaDeCentavos !== null &&
    subtotal >= entrega.gratisAcimaDeCentavos
  ) {
    return 0;
  }
  return entrega.taxaCentavos;
}

/** As linhas do resumo, na ordem: itens, taxa, e nada mais (AC-507). */
function linhasDoResumo(
  conferencia: ConferenciaNaTela | null,
  entrega: EntregaDaLojaNaTela,
  taxa: number,
  forma: "DELIVERY" | "PICKUP",
): readonly LinhaDoResumo[] {
  // CADA ITEM APARECE, e não só a soma. O AC-507 pede "o valor dos itens", e
  // uma linha só com o subtotal atende a letra e falha o propósito: quem chega
  // ao fechamento precisa CONFERIR o que está comprando antes de dar o nome e
  // o telefone. Resumo que esconde o que se leva é resumo que se aceita sem
  // ler — e a reclamação chega depois, com o pedido já na cozinha.
  const linhas: LinhaDoResumo[] = (conferencia?.itens ?? []).map((item) => ({
    chave: item.itemId,
    rotulo: `${item.quantidade}× ${item.nome}`,
    valor: escreverDinheiro(item.totalDaLinhaCentavos),
    // O PREÇO QUE NÃO É O NORMAL SE EXPLICA (AC-310): seis unidades a R$ 15,00
    // quando a vitrine anunciava R$ 20,00 é vantagem, e sem a frase parece erro.
    observacao: item.precoAplicado?.motivo ?? undefined,
  }));

  linhas.push({
    chave: "itens",
    rotulo: "Itens",
    valor: escreverDinheiro(conferencia?.subtotalCentavos ?? 0),
  });

  if (forma === "DELIVERY") {
    linhas.push({
      chave: "entrega",
      // O nome é o que o DONO deu à linha: "Taxa de entrega", "Frete",
      // "Motoboy". O padrão só entra quando ele não deu nenhum.
      rotulo: entrega.nomeDaTaxa ?? "Taxa de entrega",
      valor: taxa === 0 ? "Grátis" : escreverDinheiro(taxa),
    });
  }

  return linhas;
}

/** A frase do que impede fechar, quando o subtotal não alcança o mínimo. */
function impedimento(
  entrega: EntregaDaLojaNaTela,
  forma: "DELIVERY" | "PICKUP",
  subtotal: number,
): string | null {
  if (forma !== "DELIVERY") return null;
  const minimo = entrega.minimoParaEntregaCentavos;
  if (minimo === null || subtotal >= minimo) return null;

  // DIZ QUANTO FALTA, e não só que falta: a pessoa precisa saber o que fazer,
  // e "pedido mínimo de R$ 30,00" a manda calcular sozinha (AC-508).
  return `Faltam ${escreverDinheiro(minimo - subtotal)} para o pedido mínimo de entrega.`;
}
