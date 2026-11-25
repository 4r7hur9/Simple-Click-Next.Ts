"use client";

/**
 * Configurações da plataforma: os limites padrão (card #170, T-11).
 *
 * Vale para toda loja e todo dono que não tem ajuste próprio. Mexe nos
 * endpoints que já existem (`GET` e `PATCH /v1/admin/limites`); a API grava
 * `LIMITES_PADRAO_ALTERADOS` na auditoria da plataforma, com o antes e o
 * depois. Salvar pede confirmação, porque a mudança vale para todas as lojas.
 * Não há limite de stories: não existe na API.
 */

import {
  esquemaDaEdicaoDosPadroesDeLimite,
  esquemaDosPadroesDeLimite,
  type PadroesDeLimiteNoContrato,
} from "@simpleclick/contracts";
import { Aviso, Botao, Campo, Cartao, Sucesso } from "@simpleclick/ui";
import { useEffect, useState, type FormEvent } from "react";

import {
  inteiro,
  lerDaApi,
  mensagemDaApi,
  type LeituraDaApi,
  mensagemDaRecusaDeAcesso,
} from "./apresentacao.ts";
import { INFO_DO_LIMITE, INFO_DO_LIMITE_DE_LOJAS } from "./explicacoes.ts";
import { JanelaDeConfirmacao } from "./JanelaDeConfirmacao.tsx";

type Chave = keyof PadroesDeLimiteNoContrato;

const CAMPOS: readonly {
  readonly chave: Chave;
  readonly rotulo: string;
  readonly info: (typeof INFO_DO_LIMITE)["staff"];
}[] = [
  {
    chave: "lojasPorDono",
    rotulo: "Máximo de lojas por dono",
    info: INFO_DO_LIMITE_DE_LOJAS,
  },
  {
    chave: "staffPorLoja",
    rotulo: "Máximo de pessoas na equipe",
    info: INFO_DO_LIMITE.staff,
  },
  {
    chave: "produtosPorLoja",
    rotulo: "Máximo de produtos",
    info: INFO_DO_LIMITE.produtos,
  },
  {
    chave: "categoriasPorLoja",
    rotulo: "Máximo de categorias",
    info: INFO_DO_LIMITE.categorias,
  },
  {
    chave: "clientesPorLoja",
    rotulo: "Máximo de clientes",
    info: INFO_DO_LIMITE.clientes,
  },
];

type Digitado = Readonly<Record<Chave, string>>;

function digitadoDe(padroes: PadroesDeLimiteNoContrato): Digitado {
  return {
    lojasPorDono: String(padroes.lojasPorDono),
    staffPorLoja: String(padroes.staffPorLoja),
    produtosPorLoja: String(padroes.produtosPorLoja),
    categoriasPorLoja: String(padroes.categoriasPorLoja),
    clientesPorLoja: String(padroes.clientesPorLoja),
  };
}

/** Só o que mudou vai no corpo; sem mudança, não há o que salvar. */
export function corpoDosPadroes(
  atuais: PadroesDeLimiteNoContrato,
  digitado: Digitado,
):
  | { readonly corpo: Partial<Record<Chave, number>> }
  | { readonly erro: string } {
  const corpo: Record<string, number> = {};
  for (const { chave, rotulo } of CAMPOS) {
    const texto = digitado[chave].trim();
    if (!/^\d+$/.test(texto)) {
      return { erro: `${rotulo}: informe um número inteiro.` };
    }
    if (Number(texto) !== atuais[chave]) corpo[chave] = Number(texto);
  }
  if (Object.keys(corpo).length === 0) {
    return { erro: "Nenhum limite foi alterado." };
  }
  const lido = esquemaDaEdicaoDosPadroesDeLimite.safeParse(corpo);
  return lido.success
    ? { corpo: lido.data as Partial<Record<Chave, number>> }
    : { erro: lido.error.issues[0]?.message ?? "Limite inválido." };
}

export function LimitesPadrao() {
  const [leitura, setLeitura] = useState<
    LeituraDaApi<PadroesDeLimiteNoContrato> | { readonly fase: "carregando" }
  >({ fase: "carregando" });
  const [tentativa, setTentativa] = useState(0);
  const [digitado, setDigitado] = useState<Digitado | null>(null);
  const [pendente, setPendente] = useState<Partial<
    Record<Chave, number>
  > | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [erroDaJanela, setErroDaJanela] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    let vivo = true;
    setLeitura({ fase: "carregando" });
    void lerDaApi(
      "/api/admin/limites",
      (corpo) => esquemaDosPadroesDeLimite.parse(corpo),
      "Não foi possível carregar os limites padrão.",
    ).then((lida) => {
      if (!vivo) return;
      setLeitura(lida);
      if (lida.fase === "pronta") setDigitado(digitadoDe(lida.dados));
    });
    return () => {
      vivo = false;
    };
  }, [tentativa]);

  const atuais = leitura.fase === "pronta" ? leitura.dados : null;

  function pedirConfirmacao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (atuais === null || digitado === null) return;
    const montado = corpoDosPadroes(atuais, digitado);
    if ("erro" in montado) {
      setErro(montado.erro);
      return;
    }
    setErro(null);
    setSalvo(false);
    setErroDaJanela(null);
    setPendente(montado.corpo);
  }

  async function confirmar() {
    if (pendente === null) return;
    setSalvando(true);
    setErroDaJanela(null);
    try {
      const resposta = await fetch("/api/admin/limites", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(pendente),
      });
      const lido: unknown = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        setErroDaJanela(
          resposta.status === 401 || resposta.status === 403
            ? mensagemDaRecusaDeAcesso(
                resposta.status,
                lido,
                "Sua sessão não tem acesso à administração. Entre de novo.",
              )
            : mensagemDaApi(
                lido,
                "Os limites não foram salvos; tente de novo.",
              ),
        );
        return;
      }
      const novos = esquemaDosPadroesDeLimite.parse(lido);
      setLeitura({ fase: "pronta", dados: novos });
      setDigitado(digitadoDe(novos));
      setPendente(null);
      setSalvo(true);
    } catch {
      setErroDaJanela("Os limites não foram salvos; tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Cartao
      titulo="Limites padrão"
      nivelDoTitulo={2}
      descricao="Valem para toda loja e todo dono sem ajuste próprio. O ajuste de uma loja ou de um dono continua valendo por cima destes."
      estado={
        leitura.fase === "carregando"
          ? "carregando"
          : leitura.fase !== "pronta"
            ? "erro"
            : "pronto"
      }
      esperaComEsqueleto
      rotuloDeEspera="Carregando os limites padrão…"
      mensagemDeErro={
        leitura.fase === "erro"
          ? leitura.mensagem
          : "Não foi possível carregar os limites padrão."
      }
      rodape={
        leitura.fase === "erro" ? (
          <Botao
            variante="secundaria"
            onClick={() => setTentativa((n) => n + 1)}
          >
            Tentar de novo
          </Botao>
        ) : undefined
      }
    >
      {atuais !== null && digitado !== null && (
        <form
          noValidate
          onSubmit={pedirConfirmacao}
          className="grid gap-4 pt-4"
        >
          {salvo && (
            <Sucesso titulo="Limites padrão salvos e registrados na auditoria da plataforma." />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {CAMPOS.map(({ chave, rotulo, info }) => (
              <Campo
                key={chave}
                id={`padrao-${chave}`}
                rotulo={rotulo}
                info={info}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                dica={`Número inteiro. Hoje: ${inteiro(atuais[chave])}.`}
                value={digitado[chave]}
                onChange={(evento) => {
                  const valor = evento.target.value;
                  setDigitado((antes) =>
                    antes === null ? antes : { ...antes, [chave]: valor },
                  );
                  setErro(null);
                  setSalvo(false);
                }}
              />
            ))}
          </div>
          {erro !== null && (
            <Aviso tom="erro" titulo="Nada mudou">
              <p>{erro}</p>
            </Aviso>
          )}
          <div>
            <Botao type="submit">Salvar limites</Botao>
          </div>
        </form>
      )}

      {pendente !== null && atuais !== null && (
        <JanelaDeConfirmacao
          id="limites-padrao"
          titulo="Alterar os limites padrão?"
          aoFechar={() => (salvando ? undefined : setPendente(null))}
          rodape={
            <>
              <Botao
                carregando={salvando}
                rotuloDeEspera="Salvando…"
                onClick={() => void confirmar()}
              >
                Confirmar e salvar
              </Botao>
              <Botao
                variante="secundaria"
                desabilitado={salvando}
                onClick={() => setPendente(null)}
              >
                Cancelar
              </Botao>
            </>
          }
        >
          <div className="grid gap-3 text-sm">
            <p>
              A mudança vale para todas as lojas e donos sem ajuste próprio e
              fica registrada na auditoria da plataforma.
            </p>
            <ul className="grid gap-1">
              {CAMPOS.filter(({ chave }) => chave in pendente).map(
                ({ chave, rotulo }) => (
                  <li key={chave}>
                    {rotulo}: {inteiro(atuais[chave])} →{" "}
                    <strong>{inteiro(pendente[chave] ?? atuais[chave])}</strong>
                  </li>
                ),
              )}
            </ul>
            {erroDaJanela !== null && (
              <Aviso tom="erro" titulo="Nada mudou">
                <p>{erroDaJanela}</p>
              </Aviso>
            )}
          </div>
        </JanelaDeConfirmacao>
      )}
    </Cartao>
  );
}
