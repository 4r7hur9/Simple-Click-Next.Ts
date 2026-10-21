"use client";
/**
 * O fechamento do pedido, DENTRO DA JANELA DO CARRINHO (AC-503 a AC-512).
 *
 * É O SEGUNDO PASSO DA MESMA JANELA. "Fechar pedido" no carrinho troca o
 * conteúdo para este, sem trocar de página: cabeçalho verde com "Finalizar
 * pedido" e o voltar, o meio que rola só se precisar, e o rodapé com o total e
 * o "Confirmar pedido" sempre à vista. Quem monta a janela (o `<dialog>`, o
 * foco preso, o Esc) é o carrinho; aqui é o conteúdo.
 *
 * QUEM PEDE É A CONTA LOGADA. Nome, e-mail e telefone vêm dela e aparecem numa
 * linha só — a pessoa não digita de novo o que informou ao se cadastrar. O
 * telefone só é pedido quando a conta ainda não tem (e aí fica salvo nela). Na
 * entrega, os endereços salvos aparecem para escolher, o padrão já marcado, e
 * o novo fica salvo na conta.
 *
 * É COMPONENTE DE NAVEGADOR por causa do carrinho: ele é identificado por um
 * COOKIE que a API emitiu no domínio dela. O servidor do Next não tem esse
 * cookie — se fizesse a chamada, todos os visitantes dividiriam o mesmo.
 *
 * OS VALORES SÃO SEMPRE OS DO SERVIDOR. A tela mostra o que a conferência
 * devolveu; o que ela envia de volta é só referência para o registro. Ler preço
 * do que o navegador guarda é o que permite fechar um pedido de mil reais por
 * um (P-006).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Aviso,
  Botao,
  Campo,
  IconeAvancar,
  IconeFechar,
  IconeVoltar,
} from "@simpleclick/ui";

import {
  avisarQueOCarrinhoMudou,
  conferirCarrinho,
  criarPedido,
  registrarCliqueNoWhatsApp,
  type ConferenciaNaTela,
  type EnderecoNovoParaEnviar,
  type PedidoNaTela,
} from "../../lib/carrinho-do-navegador.ts";
import {
  salvarEnderecoDaConta,
  type EnderecoSalvo,
} from "../../lib/enderecos-da-conta.ts";
import { escreverDinheiro } from "../../lib/produto.ts";

import { AvisoDeMudanca, type MudancaNaTela } from "./AvisoDeMudanca.tsx";
import { CaixaPix } from "./CaixaPix.tsx";
import {
  ENDERECO_EM_BRANCO,
  type EnderecoNaTela,
} from "./CamposDeEndereco.tsx";
import { EnvioWhatsApp } from "./EnvioWhatsApp.tsx";
import {
  telefoneParaLer,
  type ContaDoComprador,
  type EntregaDaLojaNaTela,
  type FormasDaLoja,
  type PixDaLoja,
} from "./preparo-do-fechamento.ts";
import { ResumoDoPedido, type LinhaDoResumo } from "./ResumoDoPedido.tsx";
import { SeletorDeEndereco } from "./SeletorDeEndereco.tsx";
import {
  SeletorDePagamento,
  type FormaParaEscolher,
} from "./SeletorDePagamento.tsx";

export type { EntregaDaLojaNaTela, FormasDaLoja, PixDaLoja };

export type FormaDeEntrega = "DELIVERY" | "PICKUP";

/** O id do título, que dá nome à janela no passo do fechamento. */
export const ID_DO_TITULO_DO_FECHAMENTO = "titulo-do-fechamento";

/** O formulário mora no meio; o botão que o envia, no rodapé (`form=`). */
const ID_DO_FORMULARIO = "formulario-do-fechamento";

export interface FechamentoDaCompraProps {
  readonly apelidoDaLoja: string;
  readonly formas: FormasDaLoja;
  readonly formasDePagamento: readonly string[];
  readonly pix: PixDaLoja | null;
  readonly entrega: EntregaDaLojaNaTela;
  readonly linkDoCatalogo: string;
  /** Como a loja chama o catálogo — "cardápio" ou "catálogo". */
  readonly rotuloDoCatalogo: string;
  /** A conta logada: é dela que saem nome, e-mail e telefone. */
  readonly conta: ContaDoComprador;
  /** Os endereços salvos da conta, o padrão primeiro. */
  readonly enderecos?: readonly EnderecoSalvo[] | undefined;
  /** "Voltar ao carrinho": volta ao primeiro passo da janela. */
  readonly aoVoltar?: (() => void) | undefined;
  /** O X do cabeçalho: fecha a janela. Sem ele, o X não aparece. */
  readonly aoFecharJanela?: (() => void) | undefined;
  /** A sessão acabou no meio do caminho: quem monta abre o "Entrar". */
  readonly aoPrecisarDeConta?: (() => void) | undefined;
  /** Trocáveis para a prova responder sem rede. */
  readonly conferir?: typeof conferirCarrinho | undefined;
  readonly fechar?: typeof criarPedido | undefined;
  readonly salvarEndereco?: typeof salvarEnderecoDaConta | undefined;
}

/** Os rótulos das formas de pagamento que a versão 1 conhece. */
const ROTULO_DO_PAGAMENTO: Record<string, string> = {
  PIX: "PIX",
  CASH: "Dinheiro na entrega",
  CARD_ON_DELIVERY: "Cartão na entrega",
  OTHER: "Outra forma (combinar com a loja)",
};

/**
 * "100", "100,00", "R$ 100" ou "1.000,50" viram centavos. Vazio é "sem troco"
 * (`null`); o que não é dinheiro devolve `undefined`, para a tela recusar.
 */
export function trocoEmCentavos(texto: string): number | null | undefined {
  const limpo = texto.replace(/R\$|\s/g, "");
  if (limpo === "") return null;
  // Com vírgula, ela é o decimal e o ponto separa milhar. Sem vírgula, o ponto
  // só é decimal quando tem 1 ou 2 casas depois ("100.5"); senão, é milhar.
  const decimal = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : /^\d+\.\d{1,2}$/.test(limpo)
      ? limpo
      : limpo.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(decimal)) return undefined;
  const centavos = Math.round(Number(decimal) * 100);
  return centavos > 0 ? centavos : undefined;
}

/** Só a forma em dinheiro pergunta troco (AC-512). */
const PERGUNTA_TROCO = new Set(["CASH"]);

const ROTULO_DA_ENTREGA: Record<FormaDeEntrega, string> = {
  DELIVERY: "Receber em casa",
  PICKUP: "Retirar no local",
};

/**
 * Uma chave nova por TENTATIVA de fechar, e não por pedido.
 *
 * É o que faz o segundo toque no botão reencontrar o primeiro pedido em vez de
 * criar outro (AC-516).
 */
function novaChave(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** O endereço que a conta escolheria primeiro: o padrão, ou o primeiro. */
function enderecoInicial(enderecos: readonly EnderecoSalvo[]): string | null {
  return (enderecos.find((e) => e.padrao) ?? enderecos[0])?.id ?? null;
}

/** Texto vazio vira nulo: a API guarda "sem complemento", e não "". */
function ouNulo(texto: string): string | null {
  const limpo = texto.trim();
  return limpo === "" ? null : limpo;
}

/** O endereço digitado, no formato que a conta e o pedido recebem. */
function paraEnviar(endereco: EnderecoNaTela): EnderecoNovoParaEnviar {
  return {
    logradouro: endereco.logradouro.trim(),
    numero: ouNulo(endereco.numero),
    complemento: ouNulo(endereco.complemento),
    bairro: ouNulo(endereco.bairro),
    cidade: ouNulo(endereco.cidade),
    cep: ouNulo(endereco.cep),
    pontoDeReferencia: ouNulo(endereco.pontoDeReferencia),
  };
}

/**
 * Confere o endereço novo, apontando TODOS os pendentes de uma vez: um por vez
 * faz alguém corrigir, enviar, descobrir outro, e desistir no terceiro.
 */
function pendenciasDoEndereco(
  endereco: EnderecoNaTela,
): Partial<Record<keyof EnderecoNaTela, string>> {
  const pendentes: Partial<Record<keyof EnderecoNaTela, string>> = {};
  if (endereco.logradouro.trim().length < 3) {
    pendentes.logradouro = "Informe a rua ou avenida.";
  }
  if (endereco.numero.trim() === "") {
    pendentes.numero = "Informe o número, ou escreva 'sem número'.";
  }
  if (endereco.bairro.trim().length < 2) {
    pendentes.bairro = "Informe o bairro para a loja calcular a entrega.";
  }
  return pendentes;
}

export function FechamentoDaCompra({
  apelidoDaLoja,
  formas,
  formasDePagamento,
  pix,
  entrega,
  linkDoCatalogo,
  rotuloDoCatalogo,
  conta,
  enderecos = [],
  aoVoltar,
  aoFecharJanela,
  aoPrecisarDeConta,
  conferir = conferirCarrinho,
  fechar = criarPedido,
  salvarEndereco = salvarEnderecoDaConta,
}: FechamentoDaCompraProps) {
  const catalogo = rotuloDoCatalogo.toLowerCase();
  const titulo = useRef<HTMLHeadingElement>(null);

  const [conferencia, setConferencia] = useState<ConferenciaNaTela | null>(
    null,
  );
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmouMudanca, setConfirmouMudanca] = useState(false);
  const [pagamento, setPagamento] = useState<string | null>(
    formasDePagamento[0] ?? null,
  );
  const [forma, setForma] = useState<FormaDeEntrega>(
    formas.aceitaEntrega ? "DELIVERY" : "PICKUP",
  );
  const [salvos, setSalvos] = useState<readonly EnderecoSalvo[]>(enderecos);
  const [escolhido, setEscolhido] = useState<string | null>(() =>
    enderecoInicial(enderecos),
  );
  // Conta sem endereço abre direto nos campos do novo.
  const [novoAberto, setNovoAberto] = useState(enderecos.length === 0);
  const [novo, setNovo] = useState<EnderecoNaTela>(ENDERECO_EM_BRANCO);
  const [salvandoEndereco, setSalvandoEndereco] = useState(false);
  const [erroAoSalvar, setErroAoSalvar] = useState<string | null>(null);
  const [telefone, setTelefone] = useState("");
  const [observacao, setObservacao] = useState("");
  const [troco, setTroco] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [pedido, setPedido] = useState<PedidoNaTela | null>(null);
  const [chave] = useState(novaChave);

  const precisaTelefone = conta.telefone === null || conta.telefone === "";

  // Na janela, o foco começa no TÍTULO: o leitor de tela anuncia "Finalizar
  // pedido", e nenhum botão nasce com anel de foco para quem tocou.
  useEffect(() => {
    if (aoFecharJanela) titulo.current?.focus();
  }, [aoFecharJanela]);

  // `manterAviso` é a reconferência depois de uma recusa: o motivo que acabou
  // de chegar (loja fechada, mínimo, item esgotado) continua na tela (AC-517).
  const carregar = useCallback(
    async (manterAviso = false) => {
      setCarregando(true);
      const resultado = await conferir(apelidoDaLoja, null);
      if (resultado.estado === "conferido") {
        setConferencia(resultado.conferencia);
        if (!manterAviso) setErro(null);
      }
      // Falhou com o carrinho já na tela: ele continua, e o motivo da recusa
      // também. Falhou na abertura: a tela de "tentar de novo".
      setCarregando(false);
    },
    [apelidoDaLoja, conferir],
  );

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const subtotal = conferencia?.subtotalCentavos ?? 0;
  // A taxa é calculada aqui só para MOSTRAR. Quem cobra é o servidor, que
  // refaz a conta ao criar o pedido — e é o número dele que vale.
  const taxa = taxaDaEntrega(entrega, forma, subtotal);
  const totalNaTela = subtotal + taxa;
  const travado = impedimento(entrega, forma, subtotal);

  function mudarNovo(campo: keyof EnderecoNaTela, valor: string) {
    setNovo((atual) => ({ ...atual, [campo]: valor }));
  }

  async function salvarNovo() {
    const pendentes = pendenciasDoEndereco(novo);
    setErros(pendentes);
    if (Object.keys(pendentes).length > 0) return;

    setSalvandoEndereco(true);
    setErroAoSalvar(null);
    try {
      const resultado = await salvarEndereco({
        ...paraEnviar(novo),
        // O primeiro endereço da conta já nasce padrão.
        padrao: salvos.length === 0,
      });
      if (resultado.estado === "salvo") {
        const salvo = resultado.endereco;
        setSalvos((atuais) => [
          ...atuais.map((e) => (salvo.padrao ? { ...e, padrao: false } : e)),
          salvo,
        ]);
        setEscolhido(salvo.id);
        setNovoAberto(false);
        setNovo(ENDERECO_EM_BRANCO);
        return;
      }
      setErroAoSalvar(
        resultado.estado === "recusado"
          ? "Confira o endereço: a rua precisa ter pelo menos 3 letras."
          : "Não deu para salvar o endereço agora. Você pode confirmar o pedido assim mesmo: o endereço vai junto e fica salvo na sua conta.",
      );
    } finally {
      setSalvandoEndereco(false);
    }
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (conferencia === null || enviando) return;

    // A tela confere o que consegue conferir sozinha; o servidor confere de
    // novo, e é ele quem manda (P-007).
    const pendentes: Record<string, string> = {};
    if (precisaTelefone && telefone.replace(/\D/g, "").length < 10) {
      pendentes["telefone"] =
        "Informe o telefone com DDD, por exemplo (85) 91234-5678.";
    }
    let destino: { enderecoId?: string; endereco?: EnderecoNovoParaEnviar } =
      {};
    if (forma === "DELIVERY") {
      if (novoAberto) {
        Object.assign(pendentes, pendenciasDoEndereco(novo));
        destino = { endereco: paraEnviar(novo) };
      } else if (escolhido !== null) {
        destino = { enderecoId: escolhido };
      } else {
        pendentes["endereco"] = "Escolha onde entregar.";
      }
    }
    const trocoPedido =
      pagamento !== null && PERGUNTA_TROCO.has(pagamento)
        ? trocoEmCentavos(troco)
        : null;
    if (trocoPedido === undefined) {
      pendentes["troco"] = "Escreva só o valor em reais, por exemplo 100 ou 100,00.";
    } else if (trocoPedido !== null && trocoPedido < totalNaTela) {
      pendentes["troco"] =
        `O troco precisa ser para um valor maior que o total (${escreverDinheiro(totalNaTela)}).`;
    }
    setErros(pendentes);
    if (Object.keys(pendentes).length > 0) return;

    setEnviando(true);
    setErro(null);
    try {
      const resultado = await fechar(apelidoDaLoja, {
        ...(precisaTelefone ? { telefone: telefone.trim() } : {}),
        // Retirada não leva endereço: o servidor não pede, e mandá-lo seria
        // enviar dado pessoal que ninguém vai usar.
        ...(forma === "DELIVERY" ? destino : {}),
        entrega: forma,
        formaDePagamento: pagamento,
        trocoParaCentavos: trocoPedido ?? null,
        observacao: observacao.trim() === "" ? null : observacao.trim(),
        chaveDeIdempotencia: chave,
        // Vai junto SÓ para a API anotar divergência. Ela recalcula com os
        // preços dela, e é o número dela que vale (P-006).
        totalVistoCentavos: totalNaTela,
        // O subtotal dos itens, com a faixa de atacado que a conferência
        // aplicou: se o servidor calcular outro, o pedido não sai (card #57).
        subtotalVistoCentavos: subtotal,
      });

      if (resultado.estado === "criado") {
        setPedido(resultado.pedido);
        // O carrinho virou pedido: a sacola some do cardápio.
        avisarQueOCarrinhoMudou();
        return;
      }

      if (resultado.estado === "sem-conta") {
        setErro("Sua sessão terminou. Entre de novo para confirmar o pedido.");
        aoPrecisarDeConta?.();
        return;
      }

      if (resultado.estado === "recusado") {
        if (resultado.codigo.startsWith("telefone")) {
          setErros({ telefone: resultado.motivo });
        } else if (resultado.codigo.toUpperCase().includes("TROCO")) {
          setErros({ troco: resultado.motivo });
        } else {
          setErro(resultado.motivo);
        }
        return;
      }

      setErro(
        resultado.estado === "nao-pode"
          ? resultado.motivo
          : "Não foi possível fechar o pedido agora. Confira sua conexão e tente de novo.",
      );
      // O mundo mudou desde que a janela abriu: reconferir é o que mostra o
      // QUE mudou, em vez de deixar a pessoa adivinhar.
      void carregar(true);
    } finally {
      setEnviando(false);
    }
  }

  const mudancas: readonly MudancaNaTela[] = (conferencia?.mudancas ?? []).map(
    (mudanca) => ({
      itemId: mudanca.itemId,
      tipo: mudanca.tipo as MudancaNaTela["tipo"],
      explicacao: mudanca.explicacao,
    }),
  );

  const naoAtende = !formas.aceitaEntrega && !formas.aceitaRetirada;
  const vazio = conferencia !== null && conferencia.itens.length === 0;
  const pedeConfirmacao =
    conferencia !== null && conferencia.precisaConfirmar && !confirmouMudanca;
  const noFormulario =
    pedido === null &&
    conferencia !== null &&
    !vazio &&
    !naoAtende &&
    !pedeConfirmacao;

  return (
    <div className="sc-carrinho-janela__quadro sc-fechar">
      <header className="sc-carrinho-janela__topo">
        {aoVoltar && pedido === null ? (
          <button
            type="button"
            className="sc-carrinho-janela__fechar sc-fechar__voltar"
            onClick={aoVoltar}
            aria-label="Voltar ao carrinho"
          >
            <IconeVoltar aria-hidden="true" />
          </button>
        ) : null}
        <h2
          ref={titulo}
          className="sc-carrinho-janela__titulo"
          id={ID_DO_TITULO_DO_FECHAMENTO}
          tabIndex={-1}
        >
          {pedido === null ? "Finalizar pedido" : "Pedido feito"}
        </h2>
        {aoFecharJanela ? (
          <button
            type="button"
            className="sc-carrinho-janela__fechar"
            onClick={aoFecharJanela}
            aria-label="Fechar"
          >
            <IconeFechar aria-hidden="true" />
          </button>
        ) : null}
      </header>

      <div className="sc-carrinho-janela__corpo sc-fechar__corpo">
        {pedido !== null ? (
          <PedidoCriado apelidoDaLoja={apelidoDaLoja} pedido={pedido} />
        ) : carregando && conferencia === null ? (
          <div className="sc-carrinho-janela__estado" role="status">
            <span
              className="sc-carrinho-janela__esqueleto"
              aria-hidden="true"
            />
            <span
              className="sc-carrinho-janela__esqueleto"
              aria-hidden="true"
            />
            <p>Carregando seu pedido…</p>
          </div>
        ) : conferencia === null ? (
          <div className="sc-carrinho-janela__estado">
            <Aviso
              tom="erro"
              titulo="Não deu para carregar seu pedido"
              acao={
                <Botao variante="secundaria" onClick={() => void carregar()}>
                  Tentar de novo
                </Botao>
              }
            >
              A conexão com a loja falhou. Seu carrinho continua guardado.
            </Aviso>
          </div>
        ) : vazio ? (
          // Carrinho vazio NÃO é erro: é um estado legítimo, e o caminho de
          // saída é voltar ao catálogo — vazio sem saída é beco sem saída.
          <div className="sc-carrinho-janela__estado sc-carrinho-janela__vazio">
            <p>Seu carrinho está vazio.</p>
            <a className="sc-carrinho-janela__acao" href={linkDoCatalogo}>
              Ver o {catalogo}
              <IconeAvancar aria-hidden="true" />
            </a>
          </div>
        ) : naoAtende ? (
          // A LOJA NÃO ENTREGA NEM DEIXA RETIRAR (AC-905): o dono desligou os
          // dois modos. O servidor recusa do mesmo jeito.
          <div className="sc-carrinho-janela__estado">
            <p role="alert">
              Esta loja não está recebendo pedidos agora: no momento ela não
              oferece entrega nem retirada.
            </p>
            <a href={linkDoCatalogo}>Voltar ao {catalogo}</a>
          </div>
        ) : pedeConfirmacao ? (
          // MUDOU O MUNDO DESDE QUE A PESSOA MONTOU O CARRINHO: ela confirma
          // antes de seguir. Preço que caiu também pede confirmação.
          <div className="sc-fechar__mudancas">
            <AvisoDeMudanca
              mudancas={mudancas}
              nomesDoCarrinho={Object.fromEntries(
                conferencia.itens.map((item) => [item.itemId, item.nome]),
              )}
              novoTotal={escreverDinheiro(totalNaTela)}
              aoConfirmar={() => setConfirmouMudanca(true)}
              aoVoltarAoCarrinho={aoVoltar}
            />
          </div>
        ) : (
          <form
            id={ID_DO_FORMULARIO}
            className="sc-fechar__formulario"
            onSubmit={(evento) => void enviar(evento)}
            noValidate
          >
            {erro === null ? null : (
              <p className="sc-fechamento__erro" role="alert">
                {erro}
              </p>
            )}

            <QuemPede
              conta={conta}
              precisaTelefone={precisaTelefone}
              telefone={telefone}
              aoMudarTelefone={setTelefone}
              erro={erros["telefone"]}
              desabilitado={enviando}
            />

            <FormaDeReceber
              formas={formas}
              escolhida={forma}
              aoEscolher={setForma}
              entrega={entrega}
              subtotal={subtotal}
              desabilitado={enviando}
            />

            {forma === "DELIVERY" ? (
              <SeletorDeEndereco
                enderecos={salvos}
                escolhido={escolhido}
                aoEscolher={(id) => {
                  setEscolhido(id);
                  setErros((atuais) => {
                    const { endereco, ...resto } = atuais;
                    void endereco;
                    return resto;
                  });
                }}
                novoAberto={novoAberto}
                aoAbrirNovo={() => setNovoAberto(true)}
                aoCancelarNovo={() => {
                  setNovoAberto(false);
                  setErros({});
                  setErroAoSalvar(null);
                }}
                novo={novo}
                aoMudarNovo={mudarNovo}
                aoSalvarNovo={() => void salvarNovo()}
                salvando={salvandoEndereco}
                erros={erros}
                erroAoSalvar={erroAoSalvar}
                erroDoGrupo={erros["endereco"]}
                desabilitado={enviando}
              />
            ) : (
              <section
                className="sc-fechar__grupo"
                aria-labelledby="titulo-da-retirada"
              >
                <h3 className="sc-fechar__titulo" id="titulo-da-retirada">
                  Onde retirar
                </h3>
                <p className="sc-fechar__retirada">
                  {formas.enderecoDaLoja ??
                    "A loja ainda não cadastrou o endereço. Combine pelo WhatsApp depois de confirmar."}
                </p>
              </section>
            )}

            {formasDePagamento.length === 0 ? null : (
              <div className="sc-fechar__grupo">
                <SeletorDePagamento
                  formas={formasParaEscolher(formasDePagamento)}
                  escolhida={pagamento ?? undefined}
                  aoEscolher={setPagamento}
                  totalEmCentavos={totalNaTela}
                  troco={troco}
                  aoMudarTroco={setTroco}
                  erroDoTroco={erros["troco"]}
                />
                {pagamento === "PIX" && pix !== null ? (
                  <CaixaPix
                    chave={pix.chave}
                    tipoDaChave={pix.tipo}
                    nomeDoRecebedor={pix.titular}
                  />
                ) : null}
              </div>
            )}

            <div className="sc-fechar__grupo">
              <Campo
                id="checkout-observacao"
                name="observacao"
                rotulo="Observação para a loja (opcional)"
                dica="Vale para o pedido todo, até 500 letras. Ex.: interfone quebrado, ligar ao chegar."
                maxLength={500}
                value={observacao}
                onChange={(evento) => setObservacao(evento.target.value)}
                desabilitado={enviando}
              />
            </div>

            <ResumoDoPedido
              linhas={linhasDoResumo(conferencia, entrega, taxa, forma)}
              rotuloDoTotal="Total"
              total={escreverDinheiro(totalNaTela)}
              impedimento={travado}
            />
          </form>
        )}
      </div>

      {noFormulario ? (
        <footer className="sc-carrinho-janela__rodape">
          <dl className="sc-carrinho-janela__resumo">
            <div className="sc-carrinho-janela__resumo-total">
              <dt>Total</dt>
              <dd>{escreverDinheiro(totalNaTela)}</dd>
            </div>
          </dl>
          <button
            type="submit"
            form={ID_DO_FORMULARIO}
            className="sc-carrinho-janela__acao sc-carrinho-janela__acao--larga"
            disabled={enviando || travado !== null}
            aria-busy={enviando}
          >
            {enviando ? "Enviando…" : "Confirmar pedido"}
            {enviando ? null : <IconeAvancar aria-hidden="true" />}
          </button>
          {aoVoltar ? (
            <button
              type="button"
              className="sc-carrinho-janela__continuar"
              onClick={aoVoltar}
            >
              Voltar ao carrinho
            </button>
          ) : null}
        </footer>
      ) : null}
    </div>
  );
}

/** "Pedido de Ana · (85) 99999-8888": quem pede, numa linha só. */
function QuemPede({
  conta,
  precisaTelefone,
  telefone,
  aoMudarTelefone,
  erro,
  desabilitado,
}: {
  readonly conta: ContaDoComprador;
  readonly precisaTelefone: boolean;
  readonly telefone: string;
  readonly aoMudarTelefone: (valor: string) => void;
  readonly erro: string | undefined;
  readonly desabilitado: boolean;
}) {
  return (
    <section className="sc-fechar__quem" aria-label="Quem está pedindo">
      <p className="sc-fechar__quem-linha">
        Pedido de <strong>{conta.nome}</strong>
        {conta.telefone ? (
          <>
            {" "}
            · <span>{telefoneParaLer(conta.telefone)}</span>
          </>
        ) : null}
      </p>
      <p className="sc-fechar__quem-email">{conta.email}</p>
      {precisaTelefone ? (
        <Campo
          id="checkout-telefone"
          name="telefone"
          rotulo="Seu WhatsApp com DDD"
          dica="É por aqui que a loja confirma o pedido. Fica salvo na sua conta."
          placeholder="(85) 91234-5678"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={telefone}
          onChange={(evento) => aoMudarTelefone(evento.target.value)}
          obrigatorio
          desabilitado={desabilitado}
          {...(erro ? { erro } : {})}
        />
      ) : erro ? (
        <p className="sc-fechar__pendencia" role="alert">
          {erro}
        </p>
      ) : null}
    </section>
  );
}

/** Entrega ou retirada, com a taxa de cada uma já dita. */
function FormaDeReceber({
  formas,
  escolhida,
  aoEscolher,
  entrega,
  subtotal,
  desabilitado,
}: {
  readonly formas: FormasDaLoja;
  readonly escolhida: FormaDeEntrega;
  readonly aoEscolher: (forma: FormaDeEntrega) => void;
  readonly entrega: EntregaDaLojaNaTela;
  readonly subtotal: number;
  readonly desabilitado: boolean;
}) {
  const oferecidas: FormaDeEntrega[] = [];
  if (formas.aceitaEntrega) oferecidas.push("DELIVERY");
  if (formas.aceitaRetirada) oferecidas.push("PICKUP");

  if (oferecidas.length === 1) {
    // Uma forma só: a loja não oferece escolha, e a tela diz qual é em vez
    // de mostrar um grupo de rádio com uma opção.
    return (
      <p className="sc-fechar__forma-unica">
        Esta loja atende por{" "}
        <strong>{ROTULO_DA_ENTREGA[escolhida].toLowerCase()}</strong>.
      </p>
    );
  }

  return (
    <fieldset className="sc-fechar__grupo">
      <legend className="sc-fechar__titulo">Como você quer receber?</legend>
      <div className="sc-fechar__escolhas sc-fechar__escolhas--lado-a-lado">
        {oferecidas.map((opcao) => {
          const valor =
            opcao === "PICKUP"
              ? "Sem taxa"
              : entrega.taxaCentavos === null
                ? null
                : taxaDaEntrega(entrega, "DELIVERY", subtotal) === 0
                  ? "Grátis"
                  : escreverDinheiro(entrega.taxaCentavos);
          return (
            <label className="sc-fechar__escolha" key={opcao}>
              <input
                type="radio"
                id={`entrega-${opcao}`}
                name="entrega"
                value={opcao}
                checked={escolhida === opcao}
                onChange={() => aoEscolher(opcao)}
                disabled={desabilitado}
              />
              <span className="sc-fechar__escolha-texto">
                <span className="sc-fechar__escolha-nome">
                  {ROTULO_DA_ENTREGA[opcao]}
                </span>
                {valor === null ? null : (
                  <span className="sc-fechar__escolha-detalhe">{valor}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * O pedido já existe, e é isso que a tela diz primeiro. O WhatsApp é o passo
 * seguinte, não a condição: se ele falhar, se a pessoa fechar a janela ou se a
 * loja não tiver número cadastrado, o pedido continua na fila do dono e o
 * código continua valendo (AC-523).
 */
function PedidoCriado({
  apelidoDaLoja,
  pedido,
}: {
  readonly apelidoDaLoja: string;
  readonly pedido: PedidoNaTela;
}) {
  const acompanhamento = `/loja/${apelidoDaLoja}/pedido/${pedido.tokenPublico}`;

  if (pedido.whatsapp !== null) {
    const whatsapp = pedido.whatsapp;
    return (
      <EnvioWhatsApp
        codigoDoPedido={pedido.codigo}
        enderecoDaConversa={whatsapp.endereco}
        textoDoPedido={whatsapp.texto}
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
      <h3>Pedido {pedido.codigo} registrado</h3>
      <p>
        Guarde este código: é por ele que a loja encontra seu pedido. O total
        foi de <strong>{escreverDinheiro(pedido.totalCentavos)}</strong>.
      </p>
      <p>
        Esta loja não cadastrou WhatsApp para pedidos. Combine a entrega pelo
        canal de sempre, citando o código.
      </p>
      <p>
        <a className="sc-carrinho-janela__acao" href={acompanhamento}>
          Acompanhar o pedido
        </a>
      </p>
    </section>
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
  forma: FormaDeEntrega,
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

/** As linhas do resumo, na ordem: itens, subtotal, taxa (AC-507). */
function linhasDoResumo(
  conferencia: ConferenciaNaTela | null,
  entrega: EntregaDaLojaNaTela,
  taxa: number,
  forma: FormaDeEntrega,
): readonly LinhaDoResumo[] {
  // CADA ITEM APARECE, e não só a soma: quem chega ao fechamento precisa
  // CONFERIR o que está comprando antes de confirmar.
  const linhas: LinhaDoResumo[] = (conferencia?.itens ?? []).map((item) => ({
    chave: item.itemId,
    rotulo: `${item.quantidade}× ${item.nome}`,
    valor: escreverDinheiro(item.totalDaLinhaCentavos),
    // O PREÇO QUE NÃO É O NORMAL SE EXPLICA (AC-310).
    observacao: item.precoAplicado?.motivo ?? undefined,
  }));

  linhas.push({
    chave: "itens",
    rotulo: "Subtotal",
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
  forma: FormaDeEntrega,
  subtotal: number,
): string | null {
  if (forma !== "DELIVERY") return null;
  const minimo = entrega.minimoParaEntregaCentavos;
  if (minimo === null || subtotal >= minimo) return null;

  // DIZ QUANTO FALTA, e não só que falta (AC-508).
  return `Faltam ${escreverDinheiro(minimo - subtotal)} para o pedido mínimo de entrega.`;
}
