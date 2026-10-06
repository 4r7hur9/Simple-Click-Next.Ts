"use client";
/**
 * Formato de impressão do cupom (US-905: AC-919, AC-920).
 *
 * A LARGURA É A DO ROLO da impressora térmica: 58 mm (32 colunas) ou 80 mm
 * (48 colunas). O gerador do cupom recebe esta largura e monta o mesmo pedido
 * no tamanho certo — trocar aqui troca o próximo cupom.
 *
 * O ESSENCIAL NÃO TEM INTERRUPTOR. Número do pedido, itens e total saem em todo
 * cupom, e a tela diz isso em vez de oferecer uma caixa que não desliga nada.
 * O opcional — endereço, total em destaque, observações — é escolha do dono.
 *
 * A CHAVE DA IMPRESSÃO AUTOMÁTICA (T-608: AC-622, AC-626) mora no mesmo
 * formulário, desligada por padrão, com a explicação de que ela exige o agente
 * de impressão instalado. Ela só vai no corpo quando a API a informou: uma
 * resposta sem a chave não autoriza a tela a afirmar "desligada" por cima do
 * que estiver guardado. Abaixo do formulário fica o pareamento do agente.
 */
import { useCallback, useState } from "react";

import { atributosDeErro, ErroDoCampo } from "./ErroDoCampo.tsx";
import { ParearAgente } from "./ParearAgente.tsx";
import { useSecao } from "./useSecao.ts";

interface ConteudoDoCupom {
  readonly pedido: boolean;
  readonly itens: boolean;
  readonly total: boolean;
  readonly enderecoCliente: boolean;
  readonly totalEmDestaque: boolean;
  readonly observacoes: boolean;
}

export interface ImpressaoNaTela {
  readonly larguraMm: 58 | 80;
  readonly conteudo: ConteudoDoCupom;
  /** A chave do automático; ausente quando a API não a informou. */
  readonly automatico?: boolean;
}

const PADRAO: ImpressaoNaTela = {
  larguraMm: 80,
  conteudo: {
    pedido: true,
    itens: true,
    total: true,
    enderecoCliente: true,
    totalEmDestaque: false,
    observacoes: true,
  },
};

/** Colunas de texto de cada rolo, na fonte padrão da impressora térmica. */
export const COLUNAS_DO_PAPEL: Readonly<Record<58 | 80, number>> = {
  58: 32,
  80: 48,
};

const OPCIONAIS = [
  ["enderecoCliente", "Endereço do cliente"],
  ["totalEmDestaque", "Total em destaque"],
  ["observacoes", "Observações do pedido"],
] as const;

function impressaoDaApi(bruto: unknown): ImpressaoNaTela {
  const lido = bruto as Partial<ImpressaoNaTela> | null;
  return {
    larguraMm: lido?.larguraMm === 58 ? 58 : 80,
    conteudo: { ...PADRAO.conteudo, ...lido?.conteudo },
    ...(typeof lido?.automatico === "boolean"
      ? { automatico: lido.automatico }
      : {}),
  };
}

const TEXTOS = {
  carregando: "Carregando impressão…",
  carregada: "Impressão carregada.",
  salva: "Impressão salva. O próximo cupom já sai neste formato.",
};

export function FormularioImpressao() {
  // O que está EM VIGOR é o que a API guardou, e não o que a chave mostra
  // antes de salvar: a frase "em vigor" só muda depois que a gravação volta.
  const [automaticoEmVigor, setAutomaticoEmVigor] = useState(false);
  const interpretar = useCallback((bruto: unknown) => {
    const lido = impressaoDaApi(bruto);
    setAutomaticoEmVigor(lido.automatico === true);
    return lido;
  }, []);
  const secao = useSecao("impressao", PADRAO, interpretar, TEXTOS);
  const { dados, mudar, erros } = secao;

  if (secao.fase !== "pronta") {
    return (
      <p className="mt-8" role={secao.fase === "falhou" ? "alert" : "status"}>
        {secao.mensagem}
      </p>
    );
  }

  return (
    <>
      <form
        onSubmit={(evento) => {
          evento.preventDefault();
          void secao.salvar(dados);
        }}
        className="mt-8 max-w-2xl space-y-6"
        noValidate
      >
        <fieldset className="space-y-3">
          <legend className="font-medium">Largura do papel</legend>
          {([58, 80] as const).map((largura) => (
            <label
              className="mr-5 inline-flex items-center gap-2"
              key={largura}
            >
              <input
                type="radio"
                name="larguraMm"
                value={largura}
                checked={dados.larguraMm === largura}
                onChange={() =>
                  mudar((anterior) => ({ ...anterior, larguraMm: largura }))
                }
                {...atributosDeErro("larguraMm", erros)}
              />
              {largura} mm ({COLUNAS_DO_PAPEL[largura]} colunas)
            </label>
          ))}
          <ErroDoCampo campo="larguraMm" erros={erros} />
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="font-medium">Conteúdo opcional</legend>
          {OPCIONAIS.map(([campo, rotulo]) => (
            <label className="flex items-center gap-3" key={campo}>
              <input
                type="checkbox"
                name={`conteudo.${campo}`}
                checked={dados.conteudo[campo]}
                onChange={(evento) =>
                  mudar((anterior) => ({
                    ...anterior,
                    conteudo: {
                      ...anterior.conteudo,
                      [campo]: evento.target.checked,
                    },
                  }))
                }
              />
              {rotulo}
            </label>
          ))}
        </fieldset>
        <p className="text-sm text-[var(--cor-tinta-suave)]" data-essencial="">
          Número do pedido, itens e valor total saem em todo cupom e não podem
          ser desligados.
        </p>
        <fieldset className="space-y-3">
          <legend className="font-medium">Impressão automática</legend>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              role="switch"
              name="automatico"
              checked={dados.automatico === true}
              aria-describedby="explicacao-automatico"
              onChange={(evento) => {
                const ligada = evento.target.checked;
                mudar((anterior) => ({ ...anterior, automatico: ligada }));
              }}
            />
            Imprimir o cupom sozinho quando o pedido entrar
          </label>
          <p
            id="explicacao-automatico"
            className="text-sm text-[var(--cor-tinta-suave)]"
          >
            Desligada, você imprime cada cupom pelo botão do pedido, sem
            instalar nada. Ligada, o cupom sai sozinho na impressora da loja,
            mas exige instalar o agente de impressão num computador da loja e
            pareá-lo abaixo. Desligar depois não perde nenhum cupom: os que
            ficaram na fila aparecem na tela de pedidos para imprimir por
            clique.
          </p>
          <p className="text-sm font-medium" data-modo-em-vigor="">
            Em vigor:{" "}
            {automaticoEmVigor
              ? "impressão automática pelo agente."
              : "impressão por clique."}
          </p>
        </fieldset>
        <div className="flex flex-wrap items-center gap-4">
          <button
            className="sc-botao sc-botao--primario"
            type="submit"
            disabled={secao.salvando}
          >
            {secao.salvando ? "Salvando…" : "Salvar impressão"}
          </button>
          <p role="status" className="text-sm text-[var(--cor-tinta-suave)]">
            {secao.mensagem}
          </p>
        </div>
      </form>
      <ParearAgente />
    </>
  );
}
