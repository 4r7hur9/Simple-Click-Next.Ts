"use client";

/**
 * A situação da loja na ficha: suspender, reativar, excluir e restaurar
 * (AC-209, AC-210, AC-211).
 *
 * TODO ATO TEM DOIS PASSOS. Suspender tira a vitrine do ar e excluir tira a
 * loja das listagens: nenhum dos dois sai de um clique só. O segundo passo
 * diz, com as palavras que a administração vai precisar para explicar ao
 * lojista, o que muda e o que NÃO muda — e a exclusão só habilita o botão
 * com o nome da loja digitado, pela mesma regra que a API confere de novo
 * (`confirmacaoConfere`, do contrato). Sem `window.confirm`: a confirmação é
 * parte da tela, lida por leitor de tela e testável sem navegador.
 *
 * O motivo da suspensão é obrigatório e o dono o lê ao entrar no painel, e a
 * tela diz isso antes do envio.
 *
 * Painel da administração: nada anima. A resposta de cada ato é a ficha nova,
 * com o ato no topo do histórico — quem decide é a API.
 */

import {
  confirmacaoConfere,
  DIAS_DE_RETENCAO_DA_LOJA_EXCLUIDA,
  esquemaDaFichaDaLoja,
  esquemaDaSuspensaoDaLoja,
  type FichaDaLojaNoContrato,
} from "@simpleclick/contracts";
import { Aviso, Botao, Campo, Erro, Sucesso } from "@simpleclick/ui";
import { useState, type FormEvent } from "react";

import { momentoNaTela } from "./trilha-na-tela.ts";

/** Os atos desta seção. */
export type AtoDaSituacao = "suspender" | "reativar" | "excluir" | "restaurar";

type Passo =
  | { readonly fase: "parado" }
  | { readonly fase: "confirmando"; readonly ato: AtoDaSituacao }
  | { readonly fase: "enviando"; readonly ato: AtoDaSituacao }
  | { readonly fase: "feito"; readonly ato: AtoDaSituacao }
  | {
      readonly fase: "falhou";
      readonly ato: AtoDaSituacao;
      readonly mensagem: string;
    };

/** Onde cada ato mora no próprio site, e com que método. */
export function enderecoDoAto(
  lojaId: string,
  ato: AtoDaSituacao,
): { readonly url: string; readonly metodo: "PUT" | "DELETE" } {
  const base = `/api/admin/lojas/${encodeURIComponent(lojaId)}`;
  if (ato === "excluir") return { url: base, metodo: "DELETE" };
  const trecho = {
    suspender: "suspensao",
    reativar: "reativacao",
    restaurar: "restauracao",
  }[ato];
  return { url: `${base}/${trecho}`, metodo: "PUT" };
}

/** O que cada ato faz, na língua de quem vai explicar ao lojista. */
export function consequenciasDoAto(ato: AtoDaSituacao): string[] {
  switch (ato) {
    case "suspender":
      return [
        "A vitrine e o fechamento saem do ar na hora, com o aviso de loja indisponível.",
        "O dono, ao entrar no painel, vê o aviso de suspensão com este motivo.",
        "Quem já fez pedido continua acompanhando o pedido pelo link que recebeu.",
        "Nenhum produto, pedido ou configuração é apagado: a reativação devolve a loja como estava.",
      ];
    case "reativar":
      return [
        "A vitrine volta a atender com o mesmo catálogo de antes.",
        "O período da suspensão fica registrado no histórico.",
      ];
    case "excluir":
      return [
        "A loja sai das listagens e do ar na hora, inclusive o acompanhamento dos pedidos.",
        `Os dados ficam retidos por ${DIAS_DE_RETENCAO_DA_LOJA_EXCLUIDA} dias, e a loja pode ser restaurada nesse prazo.`,
        "Depois do prazo, o cadastro, os acessos e os documentos do responsável são removidos em definitivo. Pedidos, contrato e histórico ficam guardados.",
      ];
    case "restaurar":
      return [
        "A loja volta à situação de antes da exclusão: no ar, ou suspensa se estava suspensa.",
        "A restauração fica registrada no histórico com o seu nome.",
      ];
  }
}

const TITULO_DO_ATO: Readonly<Record<AtoDaSituacao, (nome: string) => string>> =
  {
    suspender: (nome) => `Suspender ${nome}?`,
    reativar: (nome) => `Reativar ${nome}?`,
    excluir: (nome) => `Excluir ${nome}?`,
    restaurar: (nome) => `Restaurar ${nome}?`,
  };

const ROTULO_DA_CONFIRMACAO: Readonly<Record<AtoDaSituacao, string>> = {
  suspender: "Confirmar a suspensão",
  reativar: "Confirmar a reativação",
  excluir: "Excluir a loja",
  restaurar: "Confirmar a restauração",
};

const ESPERA_DO_ATO: Readonly<Record<AtoDaSituacao, string>> = {
  suspender: "Suspendendo…",
  reativar: "Reativando…",
  excluir: "Excluindo…",
  restaurar: "Restaurando…",
};

const SUCESSO_DO_ATO: Readonly<Record<AtoDaSituacao, string>> = {
  suspender: "Loja suspensa. A vitrine saiu do ar.",
  reativar: "Loja reativada. A vitrine voltou a atender.",
  excluir: "Loja excluída. Os dados ficam retidos até o fim do prazo.",
  restaurar: "Loja restaurada.",
};

const FALHA_DO_ATO: Readonly<Record<AtoDaSituacao, string>> = {
  suspender: "A loja não foi suspensa e continua no ar; tente de novo.",
  reativar: "A loja não foi reativada e continua suspensa; tente de novo.",
  excluir: "A loja não foi excluída; tente de novo.",
  restaurar: "A loja não foi restaurada; tente de novo.",
};

/** A mensagem que a API mandou, quando ela mandou uma para a pessoa ler. */
function mensagemDaRecusa(corpo: unknown): string | null {
  if (typeof corpo !== "object" || corpo === null) return null;
  const { mensagem, campos } = corpo as {
    mensagem?: unknown;
    campos?: { mensagem?: unknown }[];
  };
  if (typeof mensagem === "string") return mensagem;
  const doCampo = campos?.[0]?.mensagem;
  return typeof doCampo === "string" ? doCampo : null;
}

export interface AcoesLojaProps {
  readonly ficha: FichaDaLojaNoContrato;
  readonly aoMudar: (ficha: FichaDaLojaNoContrato) => void;
  /** O relógio, para saber se o prazo de restauração já venceu. */
  readonly agora?: () => Date;
}

export function AcoesLoja({ ficha, aoMudar, agora }: AcoesLojaProps) {
  const [passo, setPasso] = useState<Passo>({ fase: "parado" });
  const [motivo, setMotivo] = useState("");
  const [erroDoMotivo, setErroDoMotivo] = useState<string | undefined>();
  const [confirmacao, setConfirmacao] = useState("");

  async function executar(ato: AtoDaSituacao) {
    setPasso({ fase: "enviando", ato });
    const { url, metodo } = enderecoDoAto(ficha.id, ato);
    const corpo =
      ato === "suspender"
        ? { motivo }
        : ato === "excluir"
          ? { confirmacao }
          : {};
    try {
      const resposta = await fetch(url, {
        method: metodo,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const lido: unknown = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        setPasso({
          fase: "falhou",
          ato,
          mensagem:
            resposta.status === 401 || resposta.status === 403
              ? "Sua sessão não tem acesso à administração. Entre de novo."
              : (mensagemDaRecusa(lido) ?? FALHA_DO_ATO[ato]),
        });
        return;
      }
      const nova = esquemaDaFichaDaLoja.parse(lido);
      setPasso({ fase: "feito", ato });
      setMotivo("");
      setConfirmacao("");
      aoMudar(nova);
    } catch {
      setPasso({ fase: "falhou", ato, mensagem: FALHA_DO_ATO[ato] });
    }
  }

  function aoPedirSuspensao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const validado = esquemaDaSuspensaoDaLoja.safeParse({ motivo });
    if (!validado.success) {
      setErroDoMotivo(
        validado.error.issues[0]?.message ?? "Informe o motivo da suspensão.",
      );
      return;
    }
    setErroDoMotivo(undefined);
    setPasso({ fase: "confirmando", ato: "suspender" });
  }

  const emConfirmacao =
    passo.fase === "confirmando" || passo.fase === "enviando"
      ? passo.ato
      : null;
  const enviando = passo.fase === "enviando";
  const nomeConfere = confirmacaoConfere(confirmacao, ficha.nome);

  /** O segundo passo de um ato: o que muda, e confirmar ou cancelar. */
  function confirmacaoDo(ato: AtoDaSituacao) {
    if (emConfirmacao !== ato) return null;
    return (
      <Aviso
        tom="atencao"
        titulo={TITULO_DO_ATO[ato](ficha.nome)}
        className="mt-4"
      >
        <ul className="list-disc space-y-1 pl-5">
          {consequenciasDoAto(ato).map((consequencia) => (
            <li key={consequencia}>{consequencia}</li>
          ))}
        </ul>
        {ato === "suspender" && (
          <p className="mt-3">
            Motivo que o dono vai ler: <strong>{motivo.trim()}</strong>
          </p>
        )}
        {ato === "excluir" && (
          <Campo
            id="ficha-confirmacao-da-exclusao"
            rotulo="Para confirmar, digite o nome da loja"
            dica={`Digite exatamente: ${ficha.nome}`}
            className="mt-4"
            autoComplete="off"
            value={confirmacao}
            onChange={(evento) => setConfirmacao(evento.target.value)}
          />
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Botao
            variante={ato === "excluir" ? "perigo" : "primaria"}
            carregando={enviando}
            rotuloDeEspera={ESPERA_DO_ATO[ato]}
            desabilitado={ato === "excluir" && !nomeConfere}
            onClick={() => void executar(ato)}
          >
            {ROTULO_DA_CONFIRMACAO[ato]}
          </Botao>
          <Botao
            variante="secundaria"
            desabilitado={enviando}
            onClick={() => {
              setPasso({ fase: "parado" });
              setConfirmacao("");
            }}
          >
            Cancelar
          </Botao>
        </div>
      </Aviso>
    );
  }

  const retorno =
    passo.fase === "feito" ? (
      <Sucesso titulo={SUCESSO_DO_ATO[passo.ato]} />
    ) : passo.fase === "falhou" ? (
      <Erro titulo="Nada mudou" mensagem={passo.mensagem} />
    ) : null;

  // ── Excluída: só resta restaurar, e só dentro do prazo ────────────────
  if (ficha.status === "DELETED") {
    const retencao = ficha.retencao;
    const removerApos =
      retencao?.removerApos === null || retencao?.removerApos === undefined
        ? null
        : new Date(retencao.removerApos);
    const instante = (agora ?? (() => new Date()))();
    const restauravel =
      removerApos !== null && removerApos.getTime() > instante.getTime();
    return (
      <div className="grid gap-4">
        {retorno}
        <Aviso
          tom="erro"
          aoVivo={false}
          titulo={
            retencao === null
              ? "Loja excluída"
              : `Loja excluída em ${momentoNaTela(retencao.excluidaEm)}`
          }
        >
          {removerApos === null ? (
            <p>
              Os dados desta loja já foram removidos em definitivo. Pedidos,
              contrato e histórico continuam guardados.
            </p>
          ) : restauravel ? (
            <p>
              Os dados ficam retidos até{" "}
              {momentoNaTela(removerApos.toISOString())}. Até lá, a loja pode
              ser restaurada; depois disso, a remoção é definitiva.
            </p>
          ) : (
            <p>
              O prazo de restauração venceu em{" "}
              {momentoNaTela(removerApos.toISOString())}. A remoção definitiva
              acontece na próxima rodada da tarefa de retenção.
            </p>
          )}
        </Aviso>
        {restauravel && (
          <div>
            <Botao
              variante="secundaria"
              desabilitado={emConfirmacao !== null}
              onClick={() =>
                setPasso({ fase: "confirmando", ato: "restaurar" })
              }
            >
              Restaurar loja
            </Botao>
            {confirmacaoDo("restaurar")}
          </div>
        )}
      </div>
    );
  }

  // ── No ar ou suspensa ───────────────────────────────────────────────────
  return (
    <div className="grid gap-6">
      {retorno}

      {ficha.status === "SUSPENDED" ? (
        <div>
          <Aviso
            tom="atencao"
            aoVivo={false}
            titulo={
              ficha.suspensao === null
                ? "Loja suspensa"
                : `Loja suspensa desde ${momentoNaTela(ficha.suspensao.desde)}`
            }
          >
            <p>
              A vitrine e o fechamento estão fora do ar.
              {ficha.suspensao !== null && (
                <>
                  {" "}
                  Motivo: <strong>{ficha.suspensao.motivo}</strong>
                </>
              )}
            </p>
          </Aviso>
          <p className="mt-4">
            <Botao
              variante="secundaria"
              desabilitado={emConfirmacao !== null}
              onClick={() => setPasso({ fase: "confirmando", ato: "reativar" })}
            >
              Reativar loja
            </Botao>
          </p>
          {confirmacaoDo("reativar")}
        </div>
      ) : (
        <form
          noValidate
          onSubmit={aoPedirSuspensao}
          aria-label="Suspensão da loja"
          className="grid gap-3"
        >
          <p>
            {ficha.status === "PENDING"
              ? "A loja ainda não foi publicada."
              : "A loja está no ar."}
          </p>
          <Campo
            id="ficha-motivo-da-suspensao"
            rotulo="Motivo da suspensão"
            dica="O dono lê este motivo ao entrar no painel. Nada é apagado."
            erro={erroDoMotivo}
            controle={
              <textarea
                id="ficha-motivo-da-suspensao"
                name="motivo"
                rows={3}
                maxLength={500}
                className="sc-campo__controle"
                value={motivo}
                aria-invalid={erroDoMotivo !== undefined || undefined}
                aria-describedby={[
                  "ficha-motivo-da-suspensao-dica",
                  erroDoMotivo !== undefined
                    ? "ficha-motivo-da-suspensao-erro"
                    : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                onChange={(evento) => {
                  setMotivo(evento.target.value);
                  setErroDoMotivo(undefined);
                  if (emConfirmacao === "suspender") {
                    setPasso({ fase: "parado" });
                  }
                }}
              />
            }
          />
          <div>
            <Botao
              type="submit"
              variante="secundaria"
              desabilitado={emConfirmacao !== null}
            >
              Suspender loja
            </Botao>
          </div>
          {confirmacaoDo("suspender")}
        </form>
      )}

      <section aria-labelledby="ficha-exclusao" className="grid gap-3">
        <h3 id="ficha-exclusao" className="text-lg font-semibold">
          Excluir a loja
        </h3>
        <p className="max-w-prose">
          A loja sai das listagens e do ar na hora. Os dados ficam retidos por{" "}
          {DIAS_DE_RETENCAO_DA_LOJA_EXCLUIDA} dias e podem ser restaurados nesse
          prazo; depois disso, a remoção é definitiva.
        </p>
        <div>
          <Botao
            variante="perigo"
            desabilitado={emConfirmacao !== null}
            onClick={() => setPasso({ fase: "confirmando", ato: "excluir" })}
          >
            Excluir loja…
          </Botao>
        </div>
        {confirmacaoDo("excluir")}
      </section>
    </div>
  );
}
