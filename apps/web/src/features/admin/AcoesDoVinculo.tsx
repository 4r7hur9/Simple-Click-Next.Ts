"use client";

/**
 * As ações de vínculo entre pessoa e loja (card #170, T-10). Este é o ÚNICO
 * lugar onde elas existem: as fichas de loja e de pessoa só linkam para a tela
 * Donos e equipes, já filtrada (D-5).
 *
 * Toda ação tem dois passos: o botão abre uma janela que mostra a loja, a
 * pessoa (e-mail mascarado) e o efeito; só o segundo clique manda à API. O
 * motivo é obrigatório em todas e fica na auditoria da plataforma.
 *
 * Os erros que a API explica (409 ultimo_dono, ja_e_dono, conta_desativada,
 * limite_atingido…; 422 mesma_pessoa) aparecem na própria janela, com a
 * mensagem dela, e nada muda.
 */

import {
  esquemaDoItemDeVinculo,
  esquemaDoMotivoDaPessoa,
  type ItemDePessoaNoContrato,
} from "@simpleclick/contracts";
import { Aviso, Botao, Campo } from "@simpleclick/ui";
import { useId, useState } from "react";

import { mensagemDaApi, mensagemDaRecusaDeAcesso } from "./apresentacao.ts";
import { INFO_DO_MOTIVO_DO_ATO } from "./explicacoes.ts";
import { EscolherPessoa, mascararEmail } from "./EscolherPessoa.tsx";
import { JanelaDeConfirmacao } from "./JanelaDeConfirmacao.tsx";

export type AtoDoVinculo =
  | "atribuir-dono"
  | "trocar-dono"
  | "remover-dono"
  | "tornar-dono"
  | "atribuir-equipe"
  | "remover-equipe";

export interface LojaDoVinculo {
  readonly lojaId: string;
  readonly nome: string;
}

/** A pessoa que já tem o vínculo (nas ações sobre um vínculo existente). */
export interface PessoaDoVinculo {
  readonly identidadeId: string;
  readonly nome: string | null;
  readonly email: string;
}

export interface PedidoDeAto {
  readonly ato: AtoDoVinculo;
  readonly loja: LojaDoVinculo;
  readonly pessoa?: PessoaDoVinculo;
}

export const ROTULO_DO_ATO: Readonly<Record<AtoDoVinculo, string>> = {
  "atribuir-dono": "Atribuir dono",
  "trocar-dono": "Trocar dono",
  "remover-dono": "Remover dono",
  "tornar-dono": "Tornar dono",
  "atribuir-equipe": "Adicionar à equipe",
  "remover-equipe": "Remover da equipe",
};

const CONFIRMAR: Readonly<Record<AtoDoVinculo, string>> = {
  "atribuir-dono": "Confirmar novo dono",
  "trocar-dono": "Confirmar a troca",
  "remover-dono": "Confirmar remoção",
  "tornar-dono": "Confirmar: tornar dono",
  "atribuir-equipe": "Confirmar na equipe",
  "remover-equipe": "Confirmar remoção",
};

const ESPERA: Readonly<Record<AtoDoVinculo, string>> = {
  "atribuir-dono": "Atribuindo…",
  "trocar-dono": "Trocando…",
  "remover-dono": "Removendo…",
  "tornar-dono": "Atribuindo…",
  "atribuir-equipe": "Adicionando…",
  "remover-equipe": "Removendo…",
};

const FALHA: Readonly<Record<AtoDoVinculo, string>> = {
  "atribuir-dono": "O dono não foi atribuído; tente de novo.",
  "trocar-dono": "O dono não foi trocado; tente de novo.",
  "remover-dono": "O dono não foi removido; tente de novo.",
  "tornar-dono": "A pessoa não virou dona; tente de novo.",
  "atribuir-equipe": "A pessoa não entrou na equipe; tente de novo.",
  "remover-equipe": "A pessoa não saiu da equipe; tente de novo.",
};

/** Ações que pedem escolher uma pessoa na busca. */
export function pedeEscolherPessoa(ato: AtoDoVinculo): boolean {
  return (
    ato === "atribuir-dono" ||
    ato === "trocar-dono" ||
    ato === "atribuir-equipe"
  );
}

/** O que a ação faz, dito antes do segundo clique. */
export function efeitoDoAto(
  ato: AtoDoVinculo,
  loja: string,
  pessoa: string,
): string[] {
  const auditoria =
    "O ato fica registrado na auditoria da plataforma, com o seu nome e o motivo.";
  switch (ato) {
    case "atribuir-dono":
      return [
        `${pessoa} passa a ser dona de ${loja} e vê a loja no painel dela.`,
        "Conta nova de dono conta no limite de lojas dessa pessoa; se o limite estiver cheio, a API recusa.",
        auditoria,
      ];
    case "tornar-dono":
      return [
        `${pessoa} deixa de ser equipe e passa a ser dona de ${loja}: é o mesmo vínculo, com outro papel.`,
        auditoria,
      ];
    case "trocar-dono":
      return [
        `${pessoa} (a dona de hoje) perde o acesso de dona a ${loja} e as sessões dela caem na hora.`,
        "A pessoa escolhida passa a ser a dona, tudo de uma vez: a loja não fica sem dono.",
        "Produtos, pedidos e dados da loja não mudam.",
        auditoria,
      ];
    case "remover-dono":
      return [
        `${pessoa} deixa de ser dona de ${loja} e as sessões dela caem na hora.`,
        "A loja precisa continuar com outro dono ativo: se esta for a última pessoa, a API recusa.",
        auditoria,
      ];
    case "atribuir-equipe":
      return [
        `${pessoa} entra na equipe de ${loja}, com o acesso de equipe ao painel.`,
        auditoria,
      ];
    case "remover-equipe":
      return [
        `${pessoa} sai da equipe de ${loja} e as sessões dela caem na hora.`,
        "O vínculo não é apagado: fica marcado como retirado, na auditoria.",
        auditoria,
      ];
  }
}

function rotuloDaPessoa(pessoa: PessoaDoVinculo): string {
  return pessoa.nome ?? mascararEmail(pessoa.email);
}

export function JanelaDoVinculo({
  pedido,
  aoFechar,
  aoConcluir,
}: {
  readonly pedido: PedidoDeAto;
  readonly aoFechar: () => void;
  /** O ato foi gravado: a lista deve recarregar. */
  readonly aoConcluir: () => void;
}) {
  const id = useId();
  const { ato, loja, pessoa } = pedido;
  const [escolhida, setEscolhida] = useState<ItemDePessoaNoContrato | null>(
    null,
  );
  const [motivo, setMotivo] = useState("");
  const [erroDoMotivo, setErroDoMotivo] = useState<string | undefined>();
  const [faltaPessoa, setFaltaPessoa] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);

  // Quem aparece na confirmação: a escolhida (atribuir/trocar) ou a que já tem
  // o vínculo (remover/tornar dono).
  const alvo: PessoaDoVinculo | undefined = pedeEscolherPessoa(ato)
    ? (escolhida ?? undefined)
    : pessoa;

  function fechar() {
    if (!enviando) aoFechar();
  }

  async function confirmar() {
    if (pedeEscolherPessoa(ato) && escolhida === null) {
      setFaltaPessoa(true);
      return;
    }
    const lido = esquemaDoMotivoDaPessoa.safeParse(motivo);
    if (!lido.success) {
      setErroDoMotivo(lido.error.issues[0]?.message ?? "Informe o motivo.");
      return;
    }
    const base = `/api/admin/lojas/${encodeURIComponent(loja.lojaId)}`;
    let endereco: string;
    let metodo: "POST" | "PUT" | "DELETE";
    let corpo: object;
    switch (ato) {
      case "atribuir-dono":
        endereco = `${base}/donos`;
        metodo = "POST";
        corpo = { identidadeId: escolhida?.identidadeId, motivo: lido.data };
        break;
      case "tornar-dono":
        endereco = `${base}/donos`;
        metodo = "POST";
        corpo = { identidadeId: pessoa?.identidadeId, motivo: lido.data };
        break;
      case "trocar-dono":
        endereco = `${base}/donos/${encodeURIComponent(pessoa?.identidadeId ?? "")}/substituicao`;
        metodo = "PUT";
        corpo = { novoDonoId: escolhida?.identidadeId, motivo: lido.data };
        break;
      case "remover-dono":
        endereco = `${base}/donos/${encodeURIComponent(pessoa?.identidadeId ?? "")}`;
        metodo = "DELETE";
        corpo = { motivo: lido.data };
        break;
      case "atribuir-equipe":
        endereco = `${base}/equipe`;
        metodo = "POST";
        corpo = { identidadeId: escolhida?.identidadeId, motivo: lido.data };
        break;
      case "remover-equipe":
        endereco = `${base}/equipe/${encodeURIComponent(pessoa?.identidadeId ?? "")}`;
        metodo = "DELETE";
        corpo = { motivo: lido.data };
        break;
    }

    setErroDoMotivo(undefined);
    setFaltaPessoa(false);
    setEnviando(true);
    setFalha(null);
    try {
      const resposta = await fetch(endereco, {
        method: metodo,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      });
      if (!resposta.ok) {
        const lida: unknown = await resposta.json().catch(() => null);
        setFalha(
          resposta.status === 401 || resposta.status === 403
            ? mensagemDaRecusaDeAcesso(
                resposta.status,
                lida,
                "Sua sessão não tem acesso à administração. Entre de novo.",
              )
            : mensagemDaApi(lida, FALHA[ato]),
        );
        return;
      }
      if (resposta.status !== 204) {
        // Confere o que voltou; o que importa é a lista recarregada.
        esquemaDoItemDeVinculo.safeParse(
          await resposta.json().catch(() => null),
        );
      }
      aoConcluir();
    } catch {
      setFalha(FALHA[ato]);
    } finally {
      setEnviando(false);
    }
  }

  const nomeDoAlvo =
    alvo === undefined ? "A pessoa escolhida" : rotuloDaPessoa(alvo);
  // Na troca, o "efeito" fala da dona de hoje; o novo dono vem da escolha.
  const quemSofreOEfeito =
    ato === "trocar-dono" && pessoa !== undefined
      ? rotuloDaPessoa(pessoa)
      : nomeDoAlvo;

  return (
    <JanelaDeConfirmacao
      id={`${id}-vinculo`}
      titulo={`${ROTULO_DO_ATO[ato]}: ${loja.nome}`}
      aoFechar={fechar}
      rodape={
        <>
          <Botao
            variante={
              ato === "remover-dono" || ato === "remover-equipe"
                ? "perigo"
                : "primaria"
            }
            carregando={enviando}
            rotuloDeEspera={ESPERA[ato]}
            onClick={() => void confirmar()}
          >
            {CONFIRMAR[ato]}
          </Botao>
          <Botao variante="secundaria" desabilitado={enviando} onClick={fechar}>
            Cancelar
          </Botao>
        </>
      }
    >
      <div className="grid gap-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-[var(--cor-tinta-suave)]">Loja</dt>
          <dd className="font-medium">{loja.nome}</dd>
          {pessoa !== undefined && (
            <>
              <dt className="text-[var(--cor-tinta-suave)]">
                {ato === "trocar-dono" ? "Dono de hoje" : "Pessoa"}
              </dt>
              <dd className="font-medium">
                {pessoa.nome ?? "Sem nome"} · {mascararEmail(pessoa.email)}
              </dd>
            </>
          )}
          {escolhida !== null && (
            <>
              <dt className="text-[var(--cor-tinta-suave)]">
                {ato === "trocar-dono" ? "Novo dono" : "Pessoa"}
              </dt>
              <dd className="font-medium">
                {escolhida.nome ?? "Sem nome"} ·{" "}
                {mascararEmail(escolhida.email)}
              </dd>
            </>
          )}
        </dl>

        <ul className="list-disc space-y-1 pl-5 text-sm">
          {efeitoDoAto(ato, loja.nome, quemSofreOEfeito).map((linha) => (
            <li key={linha}>{linha}</li>
          ))}
        </ul>

        {pedeEscolherPessoa(ato) && (
          <>
            <EscolherPessoa
              rotulo={ato === "trocar-dono" ? "Novo dono" : "Pessoa"}
              escolhida={escolhida}
              excluirIds={pessoa === undefined ? [] : [pessoa.identidadeId]}
              aoEscolher={(nova) => {
                setEscolhida(nova);
                setFaltaPessoa(false);
              }}
            />
            {faltaPessoa && (
              <Aviso tom="erro" titulo="Falta escolher a pessoa">
                <p>Busque e escolha a pessoa antes de confirmar.</p>
              </Aviso>
            )}
          </>
        )}

        <Campo
          id={`${id}-motivo`}
          rotulo="Motivo"
          obrigatorio
          info={INFO_DO_MOTIVO_DO_ATO}
          dica="Até 300 caracteres. Fica na auditoria da plataforma."
          erro={erroDoMotivo}
          controle={
            <textarea
              id={`${id}-motivo`}
              rows={3}
              maxLength={300}
              className="sc-campo__controle"
              value={motivo}
              aria-invalid={erroDoMotivo !== undefined || undefined}
              aria-describedby={[
                `${id}-motivo-info`,
                `${id}-motivo-dica`,
                erroDoMotivo !== undefined && `${id}-motivo-erro`,
              ]
                .filter(Boolean)
                .join(" ")}
              onChange={(evento) => {
                setMotivo(evento.target.value);
                setErroDoMotivo(undefined);
              }}
            />
          }
        />

        {falha !== null && (
          <Aviso tom="erro" titulo="Nada mudou">
            <p>{falha}</p>
          </Aviso>
        )}
      </div>
    </JanelaDeConfirmacao>
  );
}
