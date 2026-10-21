"use client";

/**
 * Aprovar, recusar, ativar e desativar uma loja (card #29), na lista e na
 * ficha. Os quatro atos têm dois passos: o botão abre uma janela que diz o
 * que muda, e só o segundo clique manda à API. A recusa exige o motivo — o
 * dono o lê no painel — e a desativação aceita um. Cada ato entra na trilha de
 * auditoria, e quem registra é a API, na mesma transação.
 *
 * A resposta de todos os atos é a ficha nova da loja; quem chamou decide o
 * que fazer com ela (a lista recarrega, a ficha se atualiza).
 */

import {
  esquemaDaDesativacaoDaLoja,
  esquemaDaFichaDaLoja,
  esquemaDaRecusaDaLoja,
  type AtoDaAprovacao,
  type FichaDaLojaNoContrato,
  type SituacaoDaLoja,
} from "@simpleclick/contracts";
import { Aviso, Botao, Campo } from "@simpleclick/ui";
import { useId, useState } from "react";

import { mensagemDaApi } from "./apresentacao.ts";
import { INFO_DA_DESATIVACAO, INFO_DA_RECUSA } from "./explicacoes.ts";
import { JanelaDeConfirmacao } from "./JanelaDeConfirmacao.tsx";

export interface LojaParaAprovar {
  readonly id: string;
  readonly nome: string;
  readonly status: SituacaoDaLoja;
}

export interface AtosDeAprovacaoProps {
  readonly loja: LojaParaAprovar;
  readonly aoMudar: (ficha: FichaDaLojaNoContrato, ato: AtoDaAprovacao) => void;
  readonly tamanho?: "normal" | "pequeno";
}

/** Quais atos cada situação oferece, na ordem em que os botões aparecem. */
export function atosDisponiveis(status: SituacaoDaLoja): AtoDaAprovacao[] {
  switch (status) {
    case "PENDING_APPROVAL":
      return ["aprovar", "recusar"];
    case "REJECTED":
      return ["aprovar"];
    case "ACTIVE":
      return ["desativar"];
    case "INACTIVE":
      return ["ativar"];
    case "DELETED":
      return [];
  }
}

const ROTULO_DO_BOTAO: Readonly<Record<AtoDaAprovacao, string>> = {
  aprovar: "Aprovar",
  recusar: "Recusar",
  ativar: "Ativar loja",
  desativar: "Desativar loja",
};

const ROTULO_DO_BOTAO_DA_RECUSADA = "Aprovar mesmo assim";

const TITULO_DA_JANELA: Readonly<
  Record<AtoDaAprovacao, (nome: string) => string>
> = {
  aprovar: (nome) => `Aprovar ${nome}?`,
  recusar: (nome) => `Recusar ${nome}?`,
  ativar: (nome) => `Ativar ${nome}?`,
  desativar: (nome) => `Desativar ${nome}?`,
};

export function consequenciasDoAtoDeAprovacao(
  ato: AtoDaAprovacao,
  statusAtual?: SituacaoDaLoja,
): string[] {
  switch (ato) {
    case "aprovar":
      return [
        statusAtual === "REJECTED"
          ? "A recusa é desfeita e a loja entra no ar."
          : "A loja entra no ar: aparece na vitrine e no feed e passa a receber pedidos.",
        "O dono é avisado ao entrar no painel.",
        "A aprovação fica registrada na auditoria, com o seu nome.",
      ];
    case "recusar":
      return [
        "A loja não entra no ar. O painel do dono continua funcionando.",
        "O dono lê o motivo abaixo ao entrar no painel.",
        "Dá para aprovar depois, se a decisão mudar. A recusa fica registrada na auditoria.",
      ];
    case "ativar":
      return [
        "A vitrine volta a atender com o mesmo catálogo de antes.",
        "A loja volta ao feed.",
        "A ativação fica registrada na auditoria.",
      ];
    case "desativar":
      return [
        "A vitrine e o feed saem do ar na hora, sem pedido novo.",
        "Quem já pediu continua acompanhando o pedido pelo link recebido.",
        "Nada é apagado: ativar de novo devolve a loja como estava. A desativação fica registrada na auditoria.",
      ];
  }
}

const ESPERA: Readonly<Record<AtoDaAprovacao, string>> = {
  aprovar: "Aprovando…",
  recusar: "Recusando…",
  ativar: "Ativando…",
  desativar: "Desativando…",
};

const CONFIRMAR: Readonly<Record<AtoDaAprovacao, string>> = {
  aprovar: "Confirmar aprovação",
  recusar: "Confirmar recusa",
  ativar: "Confirmar ativação",
  desativar: "Confirmar desativação",
};

const FALHA: Readonly<Record<AtoDaAprovacao, string>> = {
  aprovar: "A loja não foi aprovada; tente de novo.",
  recusar: "A loja não foi recusada; tente de novo.",
  ativar: "A loja não foi ativada; tente de novo.",
  desativar: "A loja não foi desativada; tente de novo.",
};

/** O corpo de cada ato, validado pelo mesmo contrato que a API aplica. */
function corpoDoAto(
  ato: AtoDaAprovacao,
  motivo: string,
): { readonly corpo: object } | { readonly erro: string } {
  if (ato === "recusar") {
    const lido = esquemaDaRecusaDaLoja.safeParse({ motivo });
    return lido.success
      ? { corpo: lido.data }
      : { erro: lido.error.issues[0]?.message ?? "Informe o motivo." };
  }
  if (ato === "desativar") {
    const lido = esquemaDaDesativacaoDaLoja.safeParse(
      motivo.trim() === "" ? {} : { motivo },
    );
    return lido.success
      ? { corpo: lido.data }
      : { erro: lido.error.issues[0]?.message ?? "Motivo inválido." };
  }
  return { corpo: {} };
}

export function AtosDeAprovacao({
  loja,
  aoMudar,
  tamanho = "normal",
}: AtosDeAprovacaoProps) {
  const idBase = useId();
  const [ato, setAto] = useState<AtoDaAprovacao | null>(null);
  const [motivo, setMotivo] = useState("");
  const [erroDoMotivo, setErroDoMotivo] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);

  const atos = atosDisponiveis(loja.status);
  if (atos.length === 0) return null;

  function abrir(escolhido: AtoDaAprovacao) {
    setAto(escolhido);
    setMotivo("");
    setErroDoMotivo(undefined);
    setFalha(null);
  }

  function fechar() {
    if (enviando) return;
    setAto(null);
  }

  async function confirmar() {
    if (ato === null) return;
    const montado = corpoDoAto(ato, motivo);
    if ("erro" in montado) {
      setErroDoMotivo(montado.erro);
      return;
    }
    setErroDoMotivo(undefined);
    setEnviando(true);
    setFalha(null);
    try {
      const resposta = await fetch(
        `/api/admin/lojas/${encodeURIComponent(loja.id)}/${ato}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(montado.corpo),
        },
      );
      const lido: unknown = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        setFalha(
          resposta.status === 401 || resposta.status === 403
            ? "Sua sessão não tem acesso à administração. Entre de novo."
            : mensagemDaApi(lido, FALHA[ato]),
        );
        return;
      }
      const ficha = esquemaDaFichaDaLoja.parse(lido);
      setAto(null);
      aoMudar(ficha, ato);
    } catch {
      setFalha(FALHA[ato]);
    } finally {
      setEnviando(false);
    }
  }

  const pedeMotivo = ato === "recusar" || ato === "desativar";

  return (
    <>
      <span className="inline-flex flex-wrap items-center gap-2">
        {atos.map((escolhido) => (
          <Botao
            key={escolhido}
            tamanho={tamanho}
            variante={
              escolhido === "aprovar" || escolhido === "ativar"
                ? "primaria"
                : "secundaria"
            }
            onClick={() => abrir(escolhido)}
          >
            {escolhido === "aprovar" && loja.status === "REJECTED"
              ? ROTULO_DO_BOTAO_DA_RECUSADA
              : ROTULO_DO_BOTAO[escolhido]}
          </Botao>
        ))}
      </span>

      {ato !== null && (
        <JanelaDeConfirmacao
          id={`${idBase}-ato`}
          titulo={TITULO_DA_JANELA[ato](loja.nome)}
          aoFechar={fechar}
          rodape={
            <>
              <Botao
                variante={ato === "recusar" ? "perigo" : "primaria"}
                carregando={enviando}
                rotuloDeEspera={ESPERA[ato]}
                onClick={() => void confirmar()}
              >
                {CONFIRMAR[ato]}
              </Botao>
              <Botao
                variante="secundaria"
                desabilitado={enviando}
                onClick={fechar}
              >
                Cancelar
              </Botao>
            </>
          }
        >
          <div className="grid gap-4">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {consequenciasDoAtoDeAprovacao(ato, loja.status).map(
                (consequencia) => (
                  <li key={consequencia}>{consequencia}</li>
                ),
              )}
            </ul>
            {pedeMotivo && (
              <Campo
                id={`${idBase}-motivo`}
                rotulo={
                  ato === "recusar"
                    ? "Motivo da recusa (o dono vai ler)"
                    : "Motivo da desativação (opcional)"
                }
                obrigatorio={ato === "recusar"}
                info={ato === "recusar" ? INFO_DA_RECUSA : INFO_DA_DESATIVACAO}
                dica={
                  ato === "recusar"
                    ? "De 3 a 500 caracteres. Ex.: o CNPJ informado não confere com a razão social."
                    : "Até 500 caracteres. Se preencher, o dono lê no painel. Ex.: pedido do próprio dono."
                }
                erro={erroDoMotivo}
                controle={
                  <textarea
                    id={`${idBase}-motivo`}
                    rows={3}
                    maxLength={500}
                    className="sc-campo__controle"
                    value={motivo}
                    aria-invalid={erroDoMotivo !== undefined || undefined}
                    aria-describedby={[
                      `${idBase}-motivo-info`,
                      `${idBase}-motivo-dica`,
                      erroDoMotivo !== undefined && `${idBase}-motivo-erro`,
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
            )}
            {falha !== null && (
              <Aviso tom="erro" titulo="Nada mudou">
                <p>{falha}</p>
              </Aviso>
            )}
          </div>
        </JanelaDeConfirmacao>
      )}
    </>
  );
}
