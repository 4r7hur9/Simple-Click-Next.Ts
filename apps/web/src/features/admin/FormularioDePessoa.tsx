"use client";

/**
 * Cadastro de uma pessoa pela administração (card #170, T-9, D-4): cria a
 * identidade SEM senha e sem papel, e já devolve o link único de acesso, que
 * aparece uma vez em `AcessoDeUsoUnico`. Quem a pessoa é nas lojas muda só
 * pelos vínculos; este formulário não tem campo de papel nem de administração.
 *
 * E-mail que já existe não vira cadastro duplicado: a API responde 409
 * `email_em_uso` com o identificador da conta, e a tela leva à ficha dela.
 */

import {
  esquemaDoAcessoGerado,
  esquemaDoCadastroDePessoa,
  type AcessoGeradoNoContrato,
} from "@simpleclick/contracts";
import { Aviso, Botao, Campo, Sucesso } from "@simpleclick/ui";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { AcessoDeUsoUnico } from "./AcessoDeUsoUnico.tsx";
import { mensagemDaApi, mensagemDaRecusaDeAcesso } from "./apresentacao.ts";
import {
  INFO_DO_EMAIL_DA_PESSOA,
  INFO_DO_TELEFONE_DA_PESSOA,
} from "./explicacoes.ts";

export type CampoDaPessoa = "nome" | "email" | "telefone";

export interface ValoresDaPessoa {
  readonly nome: string;
  readonly email: string;
  readonly telefone: string;
}

export type ErrosDaPessoa = Partial<Record<CampoDaPessoa, string>>;

export const VALORES_INICIAIS_DA_PESSOA: ValoresDaPessoa = {
  nome: "",
  email: "",
  telefone: "",
};

/** Valida pelo mesmo contrato da API: o corpo pronto, ou o erro de cada campo. */
export function validarPessoa(
  valores: ValoresDaPessoa,
):
  | { readonly corpo: Record<string, unknown> }
  | { readonly erros: ErrosDaPessoa } {
  const lido = esquemaDoCadastroDePessoa.safeParse({
    nome: valores.nome,
    email: valores.email,
    telefone: valores.telefone,
  });
  if (lido.success) return { corpo: lido.data };
  const erros: ErrosDaPessoa = {};
  for (const problema of lido.error.issues) {
    const campo = problema.path[0];
    if (
      (campo === "nome" || campo === "email" || campo === "telefone") &&
      erros[campo] === undefined
    ) {
      erros[campo] = problema.message;
    }
  }
  return { erros };
}

type Envio =
  | { readonly estado: "parado" }
  | { readonly estado: "enviando" }
  | { readonly estado: "falhou"; readonly mensagem: string }
  | { readonly estado: "ja-existe"; readonly identidadeId: string }
  | {
      readonly estado: "criada";
      readonly identidadeId: string;
      readonly nome: string;
      readonly acesso: AcessoGeradoNoContrato | null;
    };

function textoDe(corpo: unknown, campo: string): string | null {
  if (typeof corpo !== "object" || corpo === null) return null;
  const valor = (corpo as Record<string, unknown>)[campo];
  return typeof valor === "string" ? valor : null;
}

export function FormularioDePessoa() {
  const [valores, setValores] = useState<ValoresDaPessoa>(
    VALORES_INICIAIS_DA_PESSOA,
  );
  const [erros, setErros] = useState<ErrosDaPessoa>({});
  const [envio, setEnvio] = useState<Envio>({ estado: "parado" });

  function mudar(campo: CampoDaPessoa, valor: string) {
    setValores((atuais) => ({ ...atuais, [campo]: valor }));
    setErros((atuais) => ({ ...atuais, [campo]: undefined }));
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (envio.estado === "enviando") return;
    const montado = validarPessoa(valores);
    if ("erros" in montado) {
      setErros(montado.erros);
      const primeiro = (["nome", "email", "telefone"] as const).find(
        (campo) => montado.erros[campo] !== undefined,
      );
      if (primeiro !== undefined) {
        document.getElementById(`nova-pessoa-${primeiro}`)?.focus();
      }
      return;
    }
    setErros({});
    setEnvio({ estado: "enviando" });
    try {
      const resposta = await fetch("/api/admin/pessoas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(montado.corpo),
      });
      const lido: unknown = await resposta.json().catch(() => null);
      if (resposta.status === 409 && textoDe(lido, "erro") === "email_em_uso") {
        const identidadeId = textoDe(lido, "identidadeId");
        setEnvio(
          identidadeId === null
            ? {
                estado: "falhou",
                mensagem: "Já existe uma conta com este e-mail.",
              }
            : { estado: "ja-existe", identidadeId },
        );
        return;
      }
      if (!resposta.ok) {
        setEnvio({
          estado: "falhou",
          mensagem:
            resposta.status === 401 || resposta.status === 403
              ? mensagemDaRecusaDeAcesso(
                  resposta.status,
                  lido,
                  "Sua sessão não tem acesso à administração. Entre de novo.",
                )
              : mensagemDaApi(
                  lido,
                  "A pessoa não foi cadastrada; tente de novo.",
                ),
        });
        return;
      }
      const identidadeId = textoDe(lido, "identidadeId");
      const acesso = esquemaDoAcessoGerado.safeParse(
        typeof lido === "object" && lido !== null
          ? (lido as { acesso?: unknown }).acesso
          : undefined,
      );
      if (identidadeId === null || !acesso.success) {
        setEnvio({
          estado: "falhou",
          mensagem: "A resposta da API veio incompleta; confira a lista.",
        });
        return;
      }
      setEnvio({
        estado: "criada",
        identidadeId,
        nome: valores.nome.trim(),
        acesso: acesso.data,
      });
    } catch {
      setEnvio({
        estado: "falhou",
        mensagem: "A pessoa não foi cadastrada; tente de novo.",
      });
    }
  }

  if (envio.estado === "criada") {
    return (
      <>
        <Sucesso
          titulo={`${envio.nome} foi cadastrada`}
          descricao={
            envio.acesso !== null
              ? "O link de acesso está na janela aberta. Copie e entregue à pessoa: ele não aparece de novo."
              : "Cadastro feito. O link de acesso já foi mostrado; gere outro pela ficha, se precisar."
          }
          acao={
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                className="sc-botao sc-botao--primaria"
                href={`/admin/contas/${envio.identidadeId}`}
                prefetch={false}
              >
                Abrir a ficha
              </Link>
              <Botao
                variante="secundaria"
                onClick={() => {
                  setValores(VALORES_INICIAIS_DA_PESSOA);
                  setEnvio({ estado: "parado" });
                }}
              >
                Cadastrar outra pessoa
              </Botao>
            </div>
          }
        />
        {envio.acesso !== null && (
          <AcessoDeUsoUnico
            acesso={envio.acesso}
            nomeDaPessoa={envio.nome}
            aoFechar={() =>
              // O link some: o resto da tela fica, o link não.
              setEnvio({ ...envio, acesso: null })
            }
          />
        )}
      </>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(evento) => void enviar(evento)}
      className="mt-8 grid max-w-3xl gap-6"
      aria-label="Cadastro de pessoa"
    >
      {envio.estado === "falhou" && (
        <Aviso tom="erro" titulo="A pessoa não foi cadastrada">
          <p>{envio.mensagem}</p>
        </Aviso>
      )}
      {envio.estado === "ja-existe" && (
        <Aviso tom="atencao" titulo="Já existe uma conta com este e-mail">
          <p>
            Não criamos outra. Abra a ficha dela para editar, gerar um link de
            acesso ou ver o histórico.
          </p>
          <p className="mt-2">
            <Link
              className="font-medium underline"
              href={`/admin/contas/${envio.identidadeId}`}
              prefetch={false}
            >
              Abrir a ficha da pessoa
            </Link>
          </p>
        </Aviso>
      )}

      <Campo
        id="nova-pessoa-nome"
        name="nome"
        rotulo="Nome"
        obrigatorio
        autoComplete="off"
        value={valores.nome}
        erro={erros.nome}
        onChange={(evento) => mudar("nome", evento.target.value)}
      />
      <Campo
        id="nova-pessoa-email"
        name="email"
        rotulo="E-mail"
        type="email"
        inputMode="email"
        obrigatorio
        autoComplete="off"
        info={INFO_DO_EMAIL_DA_PESSOA}
        value={valores.email}
        erro={erros.email}
        onChange={(evento) => mudar("email", evento.target.value)}
      />
      <Campo
        id="nova-pessoa-telefone"
        name="telefone"
        rotulo="Telefone"
        type="tel"
        inputMode="tel"
        autoComplete="off"
        info={INFO_DO_TELEFONE_DA_PESSOA}
        dica="Com DDD. Pode ficar vazio."
        value={valores.telefone}
        erro={erros.telefone}
        onChange={(evento) => mudar("telefone", evento.target.value)}
      />

      <div className="flex flex-wrap gap-3">
        <Botao
          type="submit"
          carregando={envio.estado === "enviando"}
          rotuloDeEspera="Cadastrando…"
        >
          Cadastrar e gerar o link
        </Botao>
        <Link
          className="sc-botao sc-botao--secundaria"
          href="/admin/contas"
          prefetch={false}
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
