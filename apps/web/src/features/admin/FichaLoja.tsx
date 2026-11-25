"use client";

/**
 * O cadastro da loja na administração (AC-207). A ficha em si é buscada pelo
 * `ProvedorDaFicha` e repartida entre as abas (card #29). O formulário do
 * cadastro manda à API SÓ O QUE MUDOU, validado antes pelo mesmo contrato que
 * a API aplica; a resposta é a ficha nova, com a alteração já no topo do
 * histórico.
 *
 * Nada aqui decide quem pode ver a ficha: é a API, com a credencial própria
 * da administração, e cada abertura fica registrada na trilha (AC-118).
 */

import { mensagemDaRecusaDeAcesso } from "./apresentacao.ts";
import {
  esquemaDaFichaDaLoja,
  esquemaDaRecusaDeCadastro,
  UNIDADES_DA_FEDERACAO,
  type FichaDaLojaNoContrato,
} from "@simpleclick/contracts";
import {
  Botao,
  Campo,
  Erro,
  Seletor,
  Sucesso,
  type ConteudoDoInfo,
} from "@simpleclick/ui";

import { INFO_DO_DOCUMENTO } from "./explicacoes.ts";
import { useState, type FormEvent } from "react";

import {
  edicaoDoFormulario,
  errosDaEdicao,
  validarEdicao,
  valoresDaFicha,
  type CampoDaEdicao,
  type ErrosDaEdicao,
  type ValoresDaEdicao,
} from "./edicao-da-loja.ts";

export type EstadoDaFicha =
  | { readonly fase: "carregando" }
  | { readonly fase: "nao-encontrada" }
  | { readonly fase: "erro"; readonly mensagem: string }
  | { readonly fase: "pronta"; readonly ficha: FichaDaLojaNoContrato };

export const MENSAGEM_DE_SESSAO_DA_FICHA =
  "Sua sessão não tem acesso à administração. Entre de novo.";
export const MENSAGEM_DE_FALHA_DA_FICHA =
  "Não foi possível carregar a ficha agora. Tente de novo em instantes.";

/** O endereço da ficha no próprio site. */
export function enderecoDaFicha(lojaId: string): string {
  return `/api/admin/lojas/${encodeURIComponent(lojaId)}`;
}

// ---------------------------------------------------------------------------
// O formulário do cadastro
// ---------------------------------------------------------------------------

type EstadoDoSalvamento =
  | { readonly estado: "parado" }
  | { readonly estado: "salvando" }
  | { readonly estado: "salvo" }
  | { readonly estado: "sem-mudanca" }
  | { readonly estado: "falhou"; readonly mensagem: string };

const idDoCampo = (campo: CampoDaEdicao) => `ficha-${campo}`;

/**
 * O formulário do cadastro, com estado próprio: a ficha que chega é o ponto
 * de partida, e a que a API devolve depois de salvar vira o novo ponto.
 */
export function CadastroDaLoja({
  ficha,
  aoSalvar,
}: {
  readonly ficha: FichaDaLojaNoContrato;
  readonly aoSalvar: (ficha: FichaDaLojaNoContrato) => void;
}) {
  const original = valoresDaFicha(ficha);
  const [valores, setValores] = useState<ValoresDaEdicao>(original);
  const [erros, setErros] = useState<ErrosDaEdicao>({});
  const [salvamento, setSalvamento] = useState<EstadoDoSalvamento>({
    estado: "parado",
  });

  function aoMudar(campo: CampoDaEdicao, valor: string) {
    setValores((anteriores) => ({ ...anteriores, [campo]: valor }));
    setErros((anteriores) => ({ ...anteriores, [campo]: undefined }));
  }

  async function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const edicao = edicaoDoFormulario(original, valores);
    if (edicao === null) {
      setSalvamento({ estado: "sem-mudanca" });
      return;
    }
    const validacao = validarEdicao(edicao);
    if (!validacao.ok) {
      // A recusa acontece antes de qualquer envio.
      setErros(validacao.erros);
      setSalvamento({ estado: "parado" });
      return;
    }

    setSalvamento({ estado: "salvando" });
    try {
      const resposta = await fetch(enderecoDaFicha(ficha.id), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(edicao),
      });
      const corpo: unknown = await resposta.json().catch(() => null);
      if (resposta.ok) {
        const nova = esquemaDaFichaDaLoja.parse(corpo);
        setValores(valoresDaFicha(nova));
        setSalvamento({ estado: "salvo" });
        aoSalvar(nova);
        return;
      }
      const recusa = esquemaDaRecusaDeCadastro.safeParse(corpo);
      if (resposta.status === 400 && recusa.success) {
        setErros(errosDaEdicao(recusa.data.campos));
        setSalvamento({ estado: "parado" });
        return;
      }
      setSalvamento({
        estado: "falhou",
        mensagem:
          resposta.status === 401 || resposta.status === 403
            ? mensagemDaRecusaDeAcesso(
                resposta.status,
                corpo,
                MENSAGEM_DE_SESSAO_DA_FICHA,
              )
            : "Não foi possível salvar agora. Nada foi alterado; tente de novo.",
      });
    } catch {
      setSalvamento({
        estado: "falhou",
        mensagem:
          "Não foi possível salvar agora. Nada foi alterado; tente de novo.",
      });
    }
  }

  const texto = (
    campo: CampoDaEdicao,
    rotulo: string,
    extra: {
      readonly obrigatorio?: boolean;
      readonly tipo?: string;
      readonly inputMode?: "numeric" | "tel" | "email" | "text";
      readonly dica?: string;
      readonly info?: ConteudoDoInfo;
    } = {},
  ) => (
    <Campo
      id={idDoCampo(campo)}
      name={campo}
      rotulo={rotulo}
      value={valores[campo]}
      erro={erros[campo]}
      dica={extra.dica}
      info={extra.info}
      obrigatorio={extra.obrigatorio ?? false}
      type={extra.tipo ?? "text"}
      autoComplete="off"
      inputMode={extra.inputMode}
      onChange={(evento) => aoMudar(campo, evento.target.value)}
    />
  );

  return (
    <form
      noValidate
      onSubmit={aoEnviar}
      aria-label="Cadastro da loja"
      className="grid gap-6"
    >
      {salvamento.estado === "falhou" && (
        <Erro
          titulo="O cadastro não foi salvo"
          mensagem={salvamento.mensagem}
        />
      )}
      {salvamento.estado === "salvo" && (
        <Sucesso
          titulo="Cadastro salvo"
          descricao="A alteração ficou registrada no histórico com o seu nome."
        />
      )}
      {salvamento.estado === "sem-mudanca" && (
        <p role="status" className="text-sm">
          Nada mudou: não há o que salvar.
        </p>
      )}

      <fieldset className="grid gap-4">
        <legend className="text-lg font-semibold">O negócio</legend>
        {texto("nome", "Nome da loja ou razão social", { obrigatorio: true })}
        {texto("razaoSocial", "Razão social (se diferente do nome)")}
        {texto("documento", "CPF ou CNPJ", {
          obrigatorio: true,
          inputMode: "numeric",
          dica: "Pode digitar com ou sem pontos, barra e hífen.",
          info: INFO_DO_DOCUMENTO,
        })}
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="text-lg font-semibold">Contato</legend>
        {texto("email", "E-mail de contato da loja", {
          tipo: "email",
          inputMode: "email",
        })}
        {texto("telefone", "Telefone com DDD", {
          tipo: "tel",
          inputMode: "tel",
          dica: "Ex.: (85) 99999-0000.",
        })}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="text-lg font-semibold">Endereço</legend>
        {texto("cep", "CEP", {
          inputMode: "numeric",
          dica: "8 números. Ex.: 60115-000.",
        })}
        {texto("logradouro", "Logradouro")}
        {texto("numero", "Número")}
        {texto("complemento", "Complemento")}
        {texto("bairro", "Bairro")}
        {texto("cidade", "Cidade")}
        <Campo
          id={idDoCampo("uf")}
          rotulo="Estado (UF)"
          erro={erros.uf}
          controle={
            <Seletor
              id={idDoCampo("uf")}
              name="uf"
              value={valores.uf}
              aria-invalid={erros.uf !== undefined || undefined}
              aria-describedby={
                erros.uf !== undefined ? `${idDoCampo("uf")}-erro` : undefined
              }
              onChange={(valor) => aoMudar("uf", valor)}
            >
              <option value="">Escolha…</option>
              {UNIDADES_DA_FEDERACAO.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </Seletor>
          }
        />
      </fieldset>

      <div>
        <Botao
          type="submit"
          carregando={salvamento.estado === "salvando"}
          rotuloDeEspera="Salvando…"
        >
          Salvar cadastro
        </Botao>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// A ficha
// ---------------------------------------------------------------------------
