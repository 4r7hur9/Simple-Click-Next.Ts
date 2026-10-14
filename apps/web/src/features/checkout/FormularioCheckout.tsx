"use client";

/**
 * Formulário do fechamento (AC-505, AC-506, AC-508, AC-509).
 *
 * TRÊS DECISÕES ESTRUTURAM ESTA TELA.
 *
 * A primeira: a escolha entre entrega e retirada vem PRIMEIRO, antes de
 * qualquer campo. É ela que decide se o bloco de endereço existe, e pedir
 * endereço antes de saber se vai haver entrega faz a pessoa digitar sete campos
 * para depois descobrir que não precisava.
 *
 * A segunda: a loja que só faz retirada não OFERECE entrega. Não é a opção
 * desabilitada com um aviso ao lado — é a opção que não existe. Mostrar o que
 * não se pode escolher é convidar a tentar.
 *
 * A terceira: quem já pediu nesta loja chega com os campos preenchidos e
 * EDITÁVEIS (AC-509). Preenchido e travado seria pior que vazio: a pessoa mudou
 * de casa e não tem como corrigir.
 */
import { useState } from "react";
import { Aviso, Botao, Campo } from "@simpleclick/ui";

import {
  CamposDeEndereco,
  ENDERECO_EM_BRANCO,
  type EnderecoNaTela,
} from "./CamposDeEndereco.tsx";

export type FormaDeEntrega = "DELIVERY" | "PICKUP";

/** O que a loja faz, decidido no servidor a partir da configuração dela. */
export interface FormasDaLoja {
  readonly aceitaEntrega: boolean;
  readonly aceitaRetirada: boolean;
  /** Mostrado na retirada, para a pessoa saber onde buscar. */
  readonly enderecoDaLoja?: string | null;
}

/** O que já se sabe de quem está pedindo (AC-509). */
export interface DadosConhecidos {
  readonly nome?: string;
  readonly telefone?: string;
  readonly endereco?: Partial<EnderecoNaTela>;
}

export interface EnvioDoFechamento {
  readonly entrega: FormaDeEntrega;
  readonly nome: string;
  readonly telefone: string;
  readonly endereco: EnderecoNaTela | null;
  readonly observacao: string;
}

export interface FormularioCheckoutProps {
  readonly formas: FormasDaLoja;
  readonly conhecidos?: DadosConhecidos | undefined;
  readonly aoEnviar: (dados: EnvioDoFechamento) => void;
  readonly enviando?: boolean | undefined;
  /** Recusas vindas do servidor, por nome de campo. */
  readonly errosDoServidor?: Readonly<Record<string, string>> | undefined;
}

const ROTULOS: Record<FormaDeEntrega, string> = {
  DELIVERY: "Receber em casa",
  PICKUP: "Retirar no local",
};

/** Só as formas que a loja faz, na ordem em que aparecem. */
function formasOferecidas(formas: FormasDaLoja): FormaDeEntrega[] {
  const oferecidas: FormaDeEntrega[] = [];
  if (formas.aceitaEntrega) oferecidas.push("DELIVERY");
  if (formas.aceitaRetirada) oferecidas.push("PICKUP");
  return oferecidas;
}

export function FormularioCheckout({
  formas,
  conhecidos,
  aoEnviar,
  enviando = false,
  errosDoServidor,
}: FormularioCheckoutProps) {
  const oferecidas = formasOferecidas(formas);
  const [entrega, setEntrega] = useState<FormaDeEntrega>(
    oferecidas[0] ?? "PICKUP",
  );
  const [nome, setNome] = useState(conhecidos?.nome ?? "");
  const [telefone, setTelefone] = useState(conhecidos?.telefone ?? "");
  const [observacao, setObservacao] = useState("");
  const [endereco, setEndereco] = useState<EnderecoNaTela>({
    ...ENDERECO_EM_BRANCO,
    ...conhecidos?.endereco,
  });
  const [erros, setErros] = useState<Record<string, string>>({});

  /**
   * Confere o que a tela consegue conferir sozinha.
   *
   * O servidor confere de novo, e é ele quem manda (P-007). A conferência aqui
   * existe para a pessoa não descobrir o campo vazio depois de uma ida e volta
   * pela rede — e ela aponta TODOS os pendentes de uma vez, porque um por vez
   * faz alguém corrigir, enviar, descobrir outro, e desistir no terceiro.
   */
  function conferir(): Record<string, string> {
    const pendentes: Record<string, string> = {};
    if (nome.trim().length < 2) {
      pendentes["nome"] = "Informe seu nome para a loja saber quem pediu.";
    }
    if (telefone.replace(/\D/g, "").length < 10) {
      pendentes["telefone"] =
        "Informe o telefone com DDD, por exemplo (11) 91234-5678.";
    }
    if (entrega === "DELIVERY") {
      if (endereco.logradouro.trim().length < 3) {
        pendentes["logradouro"] = "Informe a rua ou avenida.";
      }
      if (endereco.numero.trim() === "") {
        pendentes["numero"] = "Informe o número, ou escreva 'sem número'.";
      }
      if (endereco.bairro.trim().length < 2) {
        pendentes["bairro"] =
          "Informe o bairro para a loja calcular a entrega.";
      }
    }
    return pendentes;
  }

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const pendentes = conferir();
    setErros(pendentes);
    if (Object.keys(pendentes).length > 0) return;

    aoEnviar({
      entrega,
      nome: nome.trim(),
      telefone: telefone.trim(),
      // Retirada não leva endereço: o servidor RECUSA a chave, e mandá-la seria
      // enviar dado pessoal que ninguém pediu.
      endereco: entrega === "DELIVERY" ? endereco : null,
      observacao: observacao.trim(),
    });
  }

  const todosOsErros = { ...errosDoServidor, ...erros };
  const quantosPendentes = Object.keys(todosOsErros).length;

  return (
    <form className="sc-checkout" onSubmit={enviar} noValidate>
      {oferecidas.length > 1 ? (
        <fieldset className="sc-checkout__entrega">
          <legend>Como você quer receber?</legend>
          {oferecidas.map((forma) => (
            <div className="sc-checkout__opcao" key={forma}>
              <input
                type="radio"
                id={`entrega-${forma}`}
                name="entrega"
                value={forma}
                checked={entrega === forma}
                onChange={() => setEntrega(forma)}
              />
              <label htmlFor={`entrega-${forma}`}>{ROTULOS[forma]}</label>
            </div>
          ))}
        </fieldset>
      ) : (
        // Uma forma só: a loja não oferece escolha, e a tela diz qual é em vez
        // de mostrar um grupo de rádio com uma opção.
        <p className="sc-checkout__forma-unica">
          Esta loja atende por <strong>{ROTULOS[entrega].toLowerCase()}</strong>
          .
        </p>
      )}

      <Campo
        id="checkout-nome"
        name="nome"
        rotulo="Seu nome"
        value={nome}
        onChange={(evento) => setNome(evento.target.value)}
        obrigatorio
        desabilitado={enviando}
        {...(todosOsErros["nome"] ? { erro: todosOsErros["nome"] } : {})}
      />

      <Campo
        id="checkout-telefone"
        name="telefone"
        rotulo="Seu WhatsApp"
        dica="É por aqui que a loja confirma seu pedido."
        inputMode="tel"
        value={telefone}
        onChange={(evento) => setTelefone(evento.target.value)}
        obrigatorio
        desabilitado={enviando}
        {...(todosOsErros["telefone"]
          ? { erro: todosOsErros["telefone"] }
          : {})}
      />

      {entrega === "DELIVERY" ? (
        <CamposDeEndereco
          valor={endereco}
          aoMudar={(campo, valor) =>
            setEndereco((atual) => ({ ...atual, [campo]: valor }))
          }
          erros={todosOsErros}
          desabilitado={enviando}
        />
      ) : (
        <div className="sc-checkout__retirada">
          <p>Você retira no local:</p>
          <p className="sc-checkout__endereco-da-loja">
            {formas.enderecoDaLoja ?? "A loja ainda não cadastrou o endereço."}
          </p>
        </div>
      )}

      <Campo
        id="checkout-observacao"
        name="observacao"
        rotulo="Observação para a loja"
        dica="Opcional. Ex.: interfone quebrado, ligar ao chegar."
        value={observacao}
        onChange={(evento) => setObservacao(evento.target.value)}
        desabilitado={enviando}
      />

      {quantosPendentes > 0 ? (
        <Aviso tom="erro" titulo="Falta preencher">
          {quantosPendentes === 1
            ? "Um campo precisa da sua atenção."
            : `${quantosPendentes} campos precisam da sua atenção.`}
        </Aviso>
      ) : null}

      <Botao
        type="submit"
        tamanho="grande"
        forma="pilula"
        carregando={enviando}
        rotuloDeEspera="Enviando…"
      >
        Fechar pedido
      </Botao>
    </form>
  );
}
