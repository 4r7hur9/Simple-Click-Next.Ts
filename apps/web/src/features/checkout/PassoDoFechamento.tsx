"use client";

/**
 * O passo do fechamento na janela do carrinho: prepara, pede a conta e mostra.
 *
 * AO ABRIR, pede ao servidor a configuração da loja e quem está logado
 * (`PrepararFechamento`). Três saídas:
 *
 * - CONTA LOGADA: o fechamento, com nome, telefone e endereços da conta.
 * - NINGUÉM LOGADO: a janela de acesso (Entrar / Criar conta) abre por cima,
 *   e ao concluir o passo prepara de novo e segue direto para o fechamento —
 *   o carrinho é o mesmo, porque mora no cookie da API, e não na sessão. Se a
 *   pessoa fechar a janela de acesso sem entrar, fica aqui uma explicação
 *   curta com os dois botões e o voltar ao carrinho.
 * - FALHA: mensagem clara e "Tentar de novo".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Aviso, Botao, IconeFechar, IconeVoltar } from "@simpleclick/ui";

import {
  abrirJanelaDeAcesso,
  EVENTO_ACESSO_CONCLUIDO,
  type AbaDeAcesso,
} from "../auth/JanelaDeAcesso.tsx";

import {
  contaNormalizada,
  type ArquivoDeTentativas,
} from "./chave-do-fechamento.ts";
import {
  FechamentoDaCompra,
  ID_DO_TITULO_DO_FECHAMENTO,
  type FechamentoDaCompraProps,
} from "./FechamentoDaCompra.tsx";
import type {
  PreparoDoFechamento,
  PrepararFechamento,
} from "./preparo-do-fechamento.ts";

/** A frase acima das abas da janela de acesso. */
const MOTIVO_DA_CONTA =
  "Para finalizar o pedido, entre ou crie sua conta. Seu carrinho continua guardado.";

export interface PassoDoFechamentoProps {
  readonly apelidoDaLoja: string;
  readonly linkDoCatalogo: string;
  readonly rotuloDoCatalogo: string;
  readonly preparar: PrepararFechamento;
  readonly aoVoltar: () => void;
  readonly aoFecharJanela: () => void;
  /** A tentativa pendente, guardada pela janela da sacola (ver o fechamento). */
  readonly tentativas?: ArquivoDeTentativas | undefined;
  /** Trocáveis para a prova. */
  readonly pedirConta?: typeof abrirJanelaDeAcesso | undefined;
  readonly conferir?: FechamentoDaCompraProps["conferir"];
  readonly fechar?: FechamentoDaCompraProps["fechar"];
  readonly salvarEndereco?: FechamentoDaCompraProps["salvarEndereco"];
}

type PreparoPronto = Extract<PreparoDoFechamento, { estado: "pronto" }>;

type Situacao =
  | { readonly tipo: "preparando" }
  | { readonly tipo: "falhou" }
  | {
      readonly tipo: "pronto";
      readonly preparo: PreparoPronto;
    };

export function PassoDoFechamento({
  apelidoDaLoja,
  linkDoCatalogo,
  rotuloDoCatalogo,
  preparar,
  aoVoltar,
  aoFecharJanela,
  tentativas,
  pedirConta = abrirJanelaDeAcesso,
  conferir,
  fechar,
  salvarEndereco,
}: PassoDoFechamentoProps) {
  const [situacao, setSituacao] = useState<Situacao>({ tipo: "preparando" });
  // Sobe quando OUTRA conta entrou: o fechamento nasce de novo, com os dados e
  // a chave dela, e nada da conta anterior fica no formulário (AC-11020).
  const [geracaoDaConta, setGeracaoDaConta] = useState(0);
  // Sobe quando a MESMA conta voltou: o envio, travado desde o 401, destrava.
  const [sessaoRenovada, setSessaoRenovada] = useState(0);
  // O e-mail da conta que o formulário mostra, só para comparar em memória.
  const contaMostrada = useRef("");
  const renovando = useRef(false);
  const titulo = useRef<HTMLHeadingElement>(null);
  // A ação chega do servidor e troca de identidade a cada atualização da
  // página (o `router.refresh` depois de entrar). Guardada aqui, ela não
  // dispara uma segunda preparação sozinha.
  const prepararAtual = useRef(preparar);
  useEffect(() => {
    prepararAtual.current = preparar;
  }, [preparar]);

  // O botão "Fechar pedido" sumiu com o carrinho: o foco vai ao título, e o
  // leitor de tela anuncia "Finalizar pedido".
  useEffect(() => {
    titulo.current?.focus();
  }, []);

  const carregar = useCallback(async () => {
    setSituacao({ tipo: "preparando" });
    try {
      const preparo = await prepararAtual.current();
      setSituacao(
        preparo.estado === "pronto"
          ? { tipo: "pronto", preparo }
          : { tipo: "falhou" },
      );
    } catch {
      setSituacao({ tipo: "falhou" });
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const pedirParaEntrar = useCallback(
    (aba: AbaDeAcesso) =>
      pedirConta({
        aba,
        motivo: MOTIVO_DA_CONTA,
        aoEntrar: () => void carregar(),
      }),
    [carregar, pedirConta],
  );

  const semConta =
    situacao.tipo === "pronto" && situacao.preparo.conta === null;
  const comConta =
    situacao.tipo === "pronto" && situacao.preparo.conta !== null;
  const emailDaConta =
    situacao.tipo === "pronto" ? (situacao.preparo.conta?.email ?? null) : null;

  useEffect(() => {
    if (emailDaConta !== null)
      contaMostrada.current = contaNormalizada(emailDaConta);
  }, [emailDaConta]);

  /**
   * Prepara de novo SEM voltar ao "preparando": o formulário preenchido não
   * some. Diz se a conta é a mesma, outra ou se não deu para saber.
   *
   * NA DÚVIDA, É OUTRA CONTA: conta nula, e-mail diferente ou ausente. A chave
   * de um pedido devolve o pedido gravado sem olhar quem pede, e o pedido traz
   * nome, telefone e endereço.
   */
  const conferirConta = useCallback(async (): Promise<
    "mesma" | "outra" | "indefinida"
  > => {
    let preparo: PreparoDoFechamento;
    try {
      preparo = await prepararAtual.current();
    } catch {
      return "indefinida";
    }
    if (preparo.estado !== "pronto") return "indefinida";
    if (
      preparo.conta !== null &&
      contaNormalizada(preparo.conta.email) === contaMostrada.current &&
      contaMostrada.current !== ""
    ) {
      return "mesma";
    }
    tentativas?.descartar();
    // Sem conta, a janela de acesso abre (uma vez por preparação). Com outra
    // conta, o fechamento é refeito do zero.
    setGeracaoDaConta((g) => g + 1);
    setSituacao({ tipo: "pronto", preparo });
    return "outra";
  }, [tentativas]);

  /** A pessoa entrou de novo (depois do 401, ou em outra janela). */
  const renovar = useCallback(async () => {
    if (renovando.current) return;
    renovando.current = true;
    try {
      if ((await conferirConta()) === "mesma") setSessaoRenovada((n) => n + 1);
    } finally {
      renovando.current = false;
    }
  }, [conferirConta]);

  // Entrou em outra janela de acesso com o fechamento à vista.
  useEffect(() => {
    if (!comConta) return;
    const aoConcluir = () => void renovar();
    window.addEventListener(EVENTO_ACESSO_CONCLUIDO, aoConcluir);
    return () =>
      window.removeEventListener(EVENTO_ACESSO_CONCLUIDO, aoConcluir);
  }, [comConta, renovar]);

  // Ninguém logado: a janela de acesso abre sozinha, uma vez por preparação.
  useEffect(() => {
    if (semConta) pedirParaEntrar("entrar");
  }, [semConta, pedirParaEntrar]);

  if (situacao.tipo === "pronto" && situacao.preparo.conta !== null) {
    const { config, conta, enderecos } = situacao.preparo;
    return (
      <FechamentoDaCompra
        key={geracaoDaConta}
        apelidoDaLoja={apelidoDaLoja}
        formas={config.formas}
        formasDePagamento={config.formasDePagamento}
        pix={config.pix}
        entrega={config.entrega}
        linkDoCatalogo={linkDoCatalogo}
        rotuloDoCatalogo={rotuloDoCatalogo}
        conta={conta}
        enderecos={enderecos}
        aoVoltar={aoVoltar}
        aoFecharJanela={aoFecharJanela}
        // A sessão venceu no meio: entrar de novo e tocar em confirmar. O
        // formulário fica como estava.
        aoPrecisarDeConta={() =>
          pedirConta({
            aba: "entrar",
            motivo: MOTIVO_DA_CONTA,
            aoEntrar: () => void renovar(),
          })
        }
        sessaoRenovada={sessaoRenovada}
        tentativas={tentativas}
        aoConfirmarConta={async () => (await conferirConta()) === "mesma"}
        conferir={conferir}
        fechar={fechar}
        salvarEndereco={salvarEndereco}
      />
    );
  }

  return (
    <div className="sc-carrinho-janela__quadro sc-fechar">
      <header className="sc-carrinho-janela__topo">
        <button
          type="button"
          className="sc-carrinho-janela__fechar sc-fechar__voltar"
          onClick={aoVoltar}
          aria-label="Voltar à sacola"
        >
          <IconeVoltar aria-hidden="true" />
        </button>
        <h2
          ref={titulo}
          className="sc-carrinho-janela__titulo"
          id={ID_DO_TITULO_DO_FECHAMENTO}
          tabIndex={-1}
        >
          Fechar pedido
        </h2>
        <button
          type="button"
          className="sc-carrinho-janela__fechar"
          onClick={aoFecharJanela}
          aria-label="Fechar"
        >
          <IconeFechar aria-hidden="true" />
        </button>
      </header>

      <div className="sc-carrinho-janela__corpo sc-fechar__corpo">
        {situacao.tipo === "preparando" ? (
          <div className="sc-carrinho-janela__estado" role="status">
            <span
              className="sc-carrinho-janela__esqueleto"
              aria-hidden="true"
            />
            <span
              className="sc-carrinho-janela__esqueleto"
              aria-hidden="true"
            />
            <p>Preparando seu pedido…</p>
          </div>
        ) : situacao.tipo === "falhou" ? (
          <div className="sc-carrinho-janela__estado">
            <Aviso
              tom="erro"
              titulo="Não deu para abrir o fechamento"
              acao={
                <Botao variante="secundaria" onClick={() => void carregar()}>
                  Tentar de novo
                </Botao>
              }
            >
              A conexão com a loja falhou. Seu carrinho continua guardado.
            </Aviso>
          </div>
        ) : (
          <div className="sc-fechar__conta">
            <p className="sc-fechar__conta-titulo">
              Entre na sua conta para finalizar
            </p>
            <p>
              Com a conta, seu nome, telefone e endereços já vêm preenchidos, e
              você acompanha o pedido depois. Seu carrinho continua guardado.
            </p>
            <div className="sc-fechar__conta-acoes">
              <button
                type="button"
                className="sc-carrinho-janela__acao sc-carrinho-janela__acao--larga"
                onClick={() => pedirParaEntrar("entrar")}
              >
                Entrar
              </button>
              <button
                type="button"
                className="sc-fechar__secundario"
                onClick={() => pedirParaEntrar("criar")}
              >
                Criar conta
              </button>
            </div>
          </div>
        )}
      </div>

      <footer className="sc-carrinho-janela__rodape">
        <button
          type="button"
          className="sc-carrinho-janela__continuar"
          onClick={aoVoltar}
        >
          Voltar à sacola
        </button>
      </footer>
    </div>
  );
}
