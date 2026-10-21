"use client";
/**
 * WhatsApp da loja e texto da mensagem do pedido (US-903: AC-913, AC-915).
 *
 * O NÚMERO É CONFERIDO ENQUANTO O DONO DIGITA, com a mesma regra da API: a
 * tela mostra como ele fica no formato internacional, ou o que falta nele.
 * Número errado gera link que abre conversa inexistente — e o dono só
 * descobriria no primeiro pedido perdido.
 *
 * O DONO ESCREVE A SAUDAÇÃO; o corpo do pedido é do sistema. A prévia usa o
 * mesmo gerador do pedido de verdade, com um pedido de exemplo, e mostra o
 * que sempre vai na mensagem — código, itens, entrega, pagamento, total e o
 * link de acompanhamento. A mensagem sai sem marca da plataforma.
 */
import type { SecaoDeContato } from "@simpleclick/contracts";

import {
  conferirNumero,
  PARTES_OBRIGATORIAS_DO_PEDIDO,
  previaDaMensagem,
} from "../../lib/previa-da-mensagem.ts";
import { lerMensagemDoWhatsApp } from "../../lib/texto-whatsapp.ts";
import { atributosDeErro, ErroDoCampo } from "./ErroDoCampo.tsx";
import { comInfo, RotuloComInfo } from "./RotuloComInfo.tsx";
import { useSecao } from "./useSecao.ts";

/** O contato como a tela o edita. */
interface ContatoNaTela {
  readonly numero: string;
  readonly saudacao: string;
  readonly publico: boolean;
}

const SEM_CONTATO: ContatoNaTela = {
  numero: "",
  saudacao: "Olá! Segue meu pedido:",
  publico: false,
};

function contatoDaApi(bruto: unknown): ContatoNaTela {
  const lido = bruto as Partial<SecaoDeContato> | null;
  return {
    numero: lido?.numero ?? "",
    saudacao: lido?.saudacao ?? "",
    publico: lido?.publico === true,
  };
}

function contatoParaApi(contato: ContatoNaTela): SecaoDeContato {
  return {
    numero: contato.numero,
    saudacao: contato.saudacao.trim() === "" ? null : contato.saudacao,
    publico: contato.publico,
  };
}

const TEXTOS = {
  carregando: "Carregando contato…",
  carregada: "Contato carregado.",
  salva:
    "Contato salvo. Os próximos pedidos chegam neste número, com esta mensagem.",
};

export function EditorDeMensagem({
  apelidoDaLoja = "sua-loja",
}: {
  readonly apelidoDaLoja?: string;
}) {
  const secao = useSecao("contato", SEM_CONTATO, contatoDaApi, TEXTOS);
  const { dados, mudar, erros } = secao;
  const numero =
    dados.numero.trim() === "" ? null : conferirNumero(dados.numero);
  const previa = lerMensagemDoWhatsApp(
    previaDaMensagem(dados.saudacao, apelidoDaLoja),
  );

  if (secao.fase !== "pronta") {
    return (
      <p className="mt-8" role={secao.fase === "falhou" ? "alert" : "status"}>
        {secao.mensagem}
      </p>
    );
  }

  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-2">
      <form
        onSubmit={(evento) => {
          evento.preventDefault();
          void secao.salvar(contatoParaApi(dados));
        }}
        className="space-y-6"
        noValidate
      >
        <div>
          <RotuloComInfo
            para="contato-numero"
            explicacao="whatsappDaLoja"
            nome="WhatsApp da loja"
            className="font-medium"
          >
            WhatsApp da loja
          </RotuloComInfo>
          <input
            id="contato-numero"
            className="sc-campo mt-2 w-full"
            type="tel"
            name="numero"
            value={dados.numero}
            onChange={(evento) =>
              mudar((anterior) => ({
                ...anterior,
                numero: evento.target.value,
              }))
            }
            placeholder="(11) 91234-5678"
            {...comInfo("contato-numero", atributosDeErro("numero", erros))}
          />
          {numero === null ? (
            <p className="mt-2 text-sm text-[var(--cor-tinta-suave)]">
              Aceitamos máscara, espaços ou o número sem o código do país.
            </p>
          ) : numero.ok ? (
            <p className="mt-2 text-sm" data-numero="normalizado">
              Assim fica: <strong>{numero.exibicao}</strong>
            </p>
          ) : (
            <p
              className="mt-2 text-sm text-[var(--cor-atencao)]"
              data-numero="recusado"
            >
              {numero.explicacao}
            </p>
          )}
          <ErroDoCampo campo="numero" erros={erros} />
        </div>

        <label className="flex items-start gap-3">
          <input
            className="mt-1 h-5 w-5"
            type="checkbox"
            name="publico"
            checked={dados.publico}
            onChange={(evento) =>
              mudar((anterior) => ({
                ...anterior,
                publico: evento.target.checked,
              }))
            }
          />
          <span>
            <span className="font-medium">
              Exibir este WhatsApp na página Sobre
            </span>
            <span className="mt-1 block text-sm text-[var(--cor-tinta-suave)]">
              Só o número marcado aqui será público. O telefone cadastral
              continua protegido.
            </span>
          </span>
        </label>

        <div>
          <RotuloComInfo
            para="contato-saudacao"
            explicacao="saudacao"
            nome="Saudação da mensagem"
            className="font-medium"
          >
            Saudação da mensagem
          </RotuloComInfo>
          <textarea
            id="contato-saudacao"
            className="sc-campo mt-2 min-h-28 w-full"
            name="saudacao"
            value={dados.saudacao}
            onChange={(evento) =>
              mudar((anterior) => ({
                ...anterior,
                saudacao: evento.target.value,
              }))
            }
            maxLength={280}
            {...comInfo("contato-saudacao", atributosDeErro("saudacao", erros))}
          />
          <p className="mt-2 text-sm text-[var(--cor-tinta-suave)]">
            Escreva do seu jeito, ou apague para o pedido começar direto pelo
            código.
          </p>
          <ErroDoCampo campo="saudacao" erros={erros} />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button
            className="sc-botao sc-botao--primaria"
            type="submit"
            disabled={secao.salvando}
          >
            {secao.salvando ? "Salvando…" : "Salvar contato"}
          </button>
          <p role="status" className="text-sm text-[var(--cor-tinta-suave)]">
            {secao.mensagem}
          </p>
        </div>
      </form>

      <section aria-labelledby="titulo-previa-mensagem">
        <h2 id="titulo-previa-mensagem" className="font-medium">
          Como a mensagem chega para você
        </h2>
        <p className="mt-1 text-sm text-[var(--cor-tinta-suave)]">
          Com um pedido de exemplo. Estas partes vão em todo pedido e não saem:{" "}
          {PARTES_OBRIGATORIAS_DO_PEDIDO.join(", ")}.
        </p>
        <div
          className="mt-4 rounded-2xl border border-[var(--cor-borda)] bg-[var(--cor-superficie)] p-4 text-sm leading-6"
          data-previa="mensagem"
        >
          {previa.map((linha, indice) => (
            <p key={indice} className="min-h-6 whitespace-pre-wrap">
              {linha.map((pedaco, parte) =>
                pedaco.negrito ? (
                  <strong key={parte}>{pedaco.texto}</strong>
                ) : (
                  <span key={parte}>{pedaco.texto}</span>
                ),
              )}
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}
