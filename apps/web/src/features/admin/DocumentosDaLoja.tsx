"use client";

/**
 * O contrato e os documentos da loja na administração (AC-203 a AC-205).
 *
 * `DocumentosDaLoja` busca e guarda o estado; `DocumentosDaLojaNaTela` só
 * desenha os quatro estados (P-011) — e cada parte que AGE (o envio, a
 * abertura de um documento) cuida da própria chamada, como o formulário da
 * ficha.
 *
 * O ARQUIVO NUNCA TEM ENDEREÇO FIXO. A lista mostra nome, tamanho, data e
 * quem enviou; os bytes só saem pelo link temporário que a API gera NO
 * CLIQUE em "Abrir" (cinco minutos, só para quem pediu, só com a sessão da
 * administração). A tela usa o link na hora e não o guarda em lugar nenhum.
 *
 * Nada aqui decide se um arquivo serve: a API confere o tipo pelos bytes
 * (AC-204). A tela só evita mandar o vazio e o grande demais.
 */

import {
  esquemaDoDocumentoDaLoja,
  esquemaDoLinkDoDocumento,
  esquemaDosDocumentosDaLoja,
  ROTULOS_DOS_TIPOS_DE_DOCUMENTO,
  TIPOS_DE_DOCUMENTO,
  type DocumentoDaLojaNoContrato,
  type TipoDeDocumentoDaLoja,
} from "@simpleclick/contracts";
import {
  Botao,
  Campo,
  Carregando,
  Cartao,
  Erro,
  Sucesso,
  Vazio,
} from "@simpleclick/ui";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  enderecoDoArquivoNoSite,
  enderecoDoLinkDoDocumento,
  enderecoDosDocumentos,
  formatosDoSeletor,
  recusaAntesDeEnviar,
  tamanhoNaTela,
} from "./documentos-da-loja.ts";
import { momentoNaTela } from "./trilha-na-tela.ts";

export type EstadoDosDocumentos =
  | { readonly fase: "carregando" }
  | { readonly fase: "nao-encontrada" }
  | { readonly fase: "erro"; readonly mensagem: string }
  | {
      readonly fase: "pronta";
      readonly documentos: readonly DocumentoDaLojaNoContrato[];
    };

export const MENSAGEM_DE_SESSAO_DOS_DOCUMENTOS =
  "Sua sessão não tem acesso à administração. Entre de novo.";
export const MENSAGEM_DE_FALHA_DOS_DOCUMENTOS =
  "Não foi possível carregar os documentos agora. Tente de novo em instantes.";

const DICAS_DO_ARQUIVO: Readonly<Record<TipoDeDocumentoDaLoja, string>> = {
  CONTRATO:
    "Só PDF, até 10 MB. O conteúdo do arquivo é conferido, não só a extensão do nome.",
  DOCUMENTO_DO_RESPONSAVEL:
    "PDF até 10 MB, ou foto PNG ou JPEG até 5 MB. O conteúdo do arquivo é conferido, não só a extensão do nome.",
  COMPROVANTE_DE_ENDERECO:
    "PDF até 10 MB, ou foto PNG ou JPEG até 5 MB. O conteúdo do arquivo é conferido, não só a extensão do nome.",
};

/** A recusa que a API devolve quando o arquivo não serve (AC-204). */
function mensagemDaRecusa(corpo: unknown): string | null {
  if (typeof corpo !== "object" || corpo === null) return null;
  const { erro, mensagem } = corpo as { erro?: unknown; mensagem?: unknown };
  return erro === "arquivo_recusado" && typeof mensagem === "string"
    ? mensagem
    : null;
}

// ---------------------------------------------------------------------------
// O envio
// ---------------------------------------------------------------------------

type EstadoDoEnvio =
  | { readonly estado: "parado" }
  | { readonly estado: "enviando" }
  | { readonly estado: "enviado"; readonly nome: string }
  | { readonly estado: "falhou"; readonly mensagem: string };

const FALHA_DO_ENVIO =
  "O documento não foi enviado. Nada foi gravado; tente de novo.";

export function EnvioDeDocumento({
  lojaId,
  aoEnviar,
}: {
  readonly lojaId: string;
  readonly aoEnviar: (documento: DocumentoDaLojaNoContrato) => void;
}) {
  const [tipo, setTipo] = useState<TipoDeDocumentoDaLoja>("CONTRATO");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | undefined>(undefined);
  const [envio, setEnvio] = useState<EstadoDoEnvio>({ estado: "parado" });
  // Trocar a chave limpa o seletor de arquivo depois de um envio aceito.
  const [versaoDoSeletor, setVersaoDoSeletor] = useState(0);

  async function aoSubmeter(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const recusa = recusaAntesDeEnviar(tipo, arquivo);
    if (recusa !== null || arquivo === null) {
      setErro(recusa ?? "Escolha o arquivo do documento.");
      return;
    }

    setEnvio({ estado: "enviando" });
    try {
      const resposta = await fetch(
        `${enderecoDosDocumentos(lojaId)}?tipo=${encodeURIComponent(tipo)}`,
        {
          method: "POST",
          headers: {
            "content-type": arquivo.type || "application/octet-stream",
            "x-nome-do-arquivo": encodeURIComponent(arquivo.name),
          },
          body: arquivo,
        },
      );
      const corpo: unknown = await resposta.json().catch(() => null);
      if (resposta.ok) {
        const documento = esquemaDoDocumentoDaLoja.parse(
          (corpo as { documento?: unknown } | null)?.documento,
        );
        setEnvio({ estado: "enviado", nome: documento.nomeDoArquivo });
        setArquivo(null);
        setVersaoDoSeletor((anterior) => anterior + 1);
        aoEnviar(documento);
        return;
      }
      const recusada = mensagemDaRecusa(corpo);
      if (recusada !== null) {
        // A recusa aponta o campo do arquivo: é ali que a pessoa age.
        setErro(recusada);
        setEnvio({ estado: "parado" });
        return;
      }
      setEnvio({
        estado: "falhou",
        mensagem:
          resposta.status === 401 || resposta.status === 403
            ? MENSAGEM_DE_SESSAO_DOS_DOCUMENTOS
            : resposta.status === 404
              ? "A loja não foi encontrada. Nada foi gravado."
              : resposta.status === 503
                ? "O envio de documentos ainda não está disponível neste ambiente. Nada foi gravado."
                : FALHA_DO_ENVIO,
      });
    } catch {
      setEnvio({ estado: "falhou", mensagem: FALHA_DO_ENVIO });
    }
  }

  const descritoresDoArquivo = [
    "documento-arquivo-dica",
    erro !== undefined && "documento-arquivo-erro",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <form
      noValidate
      onSubmit={aoSubmeter}
      aria-label="Envio de documento"
      className="grid gap-4"
    >
      {envio.estado === "falhou" && (
        <Erro titulo="O documento não foi enviado" mensagem={envio.mensagem} />
      )}
      {envio.estado === "enviado" && (
        <Sucesso
          titulo="Documento enviado"
          descricao={`${envio.nome} já aparece na lista, com a data e o seu nome.`}
        />
      )}
      <Campo
        id="documento-tipo"
        rotulo="Tipo do documento"
        controle={
          <select
            id="documento-tipo"
            name="tipo"
            className="sc-campo__controle"
            value={tipo}
            onChange={(evento) => {
              setTipo(evento.target.value as TipoDeDocumentoDaLoja);
              setErro(undefined);
            }}
          >
            {TIPOS_DE_DOCUMENTO.map((opcao) => (
              <option key={opcao} value={opcao}>
                {ROTULOS_DOS_TIPOS_DE_DOCUMENTO[opcao]}
              </option>
            ))}
          </select>
        }
      />
      <Campo
        id="documento-arquivo"
        rotulo="Arquivo"
        dica={DICAS_DO_ARQUIVO[tipo]}
        erro={erro}
        controle={
          <input
            key={versaoDoSeletor}
            id="documento-arquivo"
            name="arquivo"
            type="file"
            className="sc-campo__controle"
            accept={formatosDoSeletor(tipo)}
            aria-invalid={erro !== undefined || undefined}
            aria-describedby={descritoresDoArquivo}
            onChange={(evento) => {
              setArquivo(evento.target.files?.[0] ?? null);
              setErro(undefined);
              setEnvio({ estado: "parado" });
            }}
          />
        }
      />
      <div>
        <Botao
          type="submit"
          carregando={envio.estado === "enviando"}
          rotuloDeEspera="Enviando o documento…"
        >
          Enviar documento
        </Botao>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// A lista e a abertura pelo link temporário
// ---------------------------------------------------------------------------

type EstadoDaAbertura =
  | { readonly estado: "parado" }
  | { readonly estado: "abrindo"; readonly id: string }
  | { readonly estado: "aberto"; readonly id: string }
  | {
      readonly estado: "falhou";
      readonly id: string;
      readonly mensagem: string;
    };

const FALHA_DA_ABERTURA =
  "Não foi possível abrir o documento agora. Tente de novo.";

/** O que dizer quando o link ou o arquivo não vem. */
function mensagemDaAbertura(status: number): string {
  if (status === 401 || status === 403) {
    return "Sua sessão não tem acesso a este documento. Entre de novo e abra pela ficha da loja.";
  }
  if (status === 404) {
    return "Este documento não foi encontrado. Recarregue a lista.";
  }
  if (status === 410) {
    return "O link venceu antes de o arquivo chegar. Clique em Abrir de novo.";
  }
  if (status === 503) {
    return "O armazenamento de documentos não está disponível neste ambiente.";
  }
  return FALHA_DA_ABERTURA;
}

/** Entrega o arquivo à pessoa como download, com o nome que ela reconhece. */
function baixar(conteudo: Blob, nome: string): void {
  const endereco = URL.createObjectURL(conteudo);
  const ancora = document.createElement("a");
  ancora.href = endereco;
  ancora.download = nome;
  ancora.rel = "noopener";
  document.body.append(ancora);
  ancora.click();
  ancora.remove();
  // O navegador precisa do endereço até o download começar.
  window.setTimeout(() => URL.revokeObjectURL(endereco), 30_000);
}

export function ListaDeDocumentos({
  lojaId,
  documentos,
}: {
  readonly lojaId: string;
  readonly documentos: readonly DocumentoDaLojaNoContrato[];
}) {
  const [abertura, setAbertura] = useState<EstadoDaAbertura>({
    estado: "parado",
  });

  async function abrir(documento: DocumentoDaLojaNoContrato) {
    const falhar = (mensagem: string) =>
      setAbertura({ estado: "falhou", id: documento.id, mensagem });
    setAbertura({ estado: "abrindo", id: documento.id });
    try {
      // O link nasce AGORA, no clique, e vale cinco minutos (AC-203).
      const gerado = await fetch(
        enderecoDoLinkDoDocumento(lojaId, documento.id),
        { method: "POST", cache: "no-store" },
      );
      const corpo: unknown = await gerado.json().catch(() => null);
      if (!gerado.ok) {
        falhar(mensagemDaAbertura(gerado.status));
        return;
      }
      const noSite = enderecoDoArquivoNoSite(
        esquemaDoLinkDoDocumento.parse(corpo).link,
      );
      if (noSite === null) {
        falhar(FALHA_DA_ABERTURA);
        return;
      }
      const arquivo = await fetch(noSite, { cache: "no-store" });
      if (!arquivo.ok) {
        falhar(mensagemDaAbertura(arquivo.status));
        return;
      }
      baixar(await arquivo.blob(), documento.nomeDoArquivo);
      setAbertura({ estado: "aberto", id: documento.id });
    } catch {
      falhar(FALHA_DA_ABERTURA);
    }
  }

  return (
    <ul className="grid gap-3" aria-label="Documentos guardados">
      {documentos.map((documento) => (
        <li key={documento.id}>
          <Cartao>
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <strong className="break-all">{documento.nomeDoArquivo}</strong>
              <span className="text-sm text-[var(--cor-tinta-suave)]">
                {ROTULOS_DOS_TIPOS_DE_DOCUMENTO[documento.tipo]}
              </span>
            </p>
            <p className="text-sm">
              {tamanhoNaTela(documento.tamanhoEmBytes)} · enviado em{" "}
              <time dateTime={documento.enviadoEm}>
                {momentoNaTela(documento.enviadoEm)}
              </time>{" "}
              por{" "}
              {documento.enviadoPor?.nome ?? "pessoa que saiu da administração"}
            </p>
            <div>
              <Botao
                variante="secundaria"
                tamanho="pequeno"
                aria-label={`Abrir ${documento.nomeDoArquivo}`}
                carregando={
                  abertura.estado === "abrindo" && abertura.id === documento.id
                }
                rotuloDeEspera="Gerando o link temporário…"
                onClick={() => void abrir(documento)}
              >
                Abrir
              </Botao>
            </div>
            {abertura.estado === "falhou" && abertura.id === documento.id && (
              <Erro
                titulo="O documento não abriu"
                mensagem={abertura.mensagem}
              />
            )}
            {abertura.estado === "aberto" && abertura.id === documento.id && (
              <p role="status" className="text-sm">
                Documento entregue como download. O link usado só abre com a sua
                sessão e vence em cinco minutos.
              </p>
            )}
          </Cartao>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// A tela
// ---------------------------------------------------------------------------

export interface DocumentosDaLojaNaTelaProps {
  readonly lojaId: string;
  readonly estado: EstadoDosDocumentos;
  readonly aoTentarDeNovo: () => void;
  readonly aoEnviar: (documento: DocumentoDaLojaNoContrato) => void;
}

function Secao({
  id,
  titulo,
  children,
}: {
  readonly id: string;
  readonly titulo: string;
  readonly children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-10">
      <h2 id={id} className="text-2xl font-semibold tracking-[-0.02em]">
        {titulo}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Só desenha. As chamadas de rede moram no envio e na abertura. */
export function DocumentosDaLojaNaTela(props: DocumentosDaLojaNaTelaProps) {
  const { estado, lojaId } = props;

  if (estado.fase === "carregando") {
    return (
      <Carregando
        rotulo="Carregando o contrato e os documentos…"
        className="mt-8"
      />
    );
  }
  if (estado.fase === "nao-encontrada") {
    return (
      <Vazio
        titulo="Loja não encontrada"
        descricao="O endereço não corresponde a nenhuma loja cadastrada."
        className="mt-8"
        acao={
          <Link className="sc-botao sc-botao--primaria" href="/admin/lojas">
            Voltar para as lojas
          </Link>
        }
      />
    );
  }
  if (estado.fase === "erro") {
    return (
      <Erro
        titulo="Os documentos não carregaram"
        mensagem={estado.mensagem}
        className="mt-8"
        acao={
          <Botao variante="secundaria" onClick={props.aoTentarDeNovo}>
            Tentar de novo
          </Botao>
        }
      />
    );
  }

  return (
    <>
      <Secao id="documentos-envio" titulo="Enviar documento">
        <Cartao>
          <EnvioDeDocumento lojaId={lojaId} aoEnviar={props.aoEnviar} />
        </Cartao>
      </Secao>
      <Secao id="documentos-guardados" titulo="Documentos guardados">
        {estado.documentos.length === 0 ? (
          <Cartao
            estado="vazio"
            tituloVazio="Nenhum documento enviado ainda"
            descricaoVazio="O contrato assinado e os documentos do responsável aparecem aqui depois do envio. Nenhum deles fica público: cada um abre por um link que vale cinco minutos."
          />
        ) : (
          <ListaDeDocumentos lojaId={lojaId} documentos={estado.documentos} />
        )}
      </Secao>
    </>
  );
}

/** Estado e rede da lista. O desenho é todo de `DocumentosDaLojaNaTela`. */
export function DocumentosDaLoja({ lojaId }: { readonly lojaId: string }) {
  const [estado, setEstado] = useState<EstadoDosDocumentos>({
    fase: "carregando",
  });
  const [tentativa, setTentativa] = useState(0);

  const carregar = useCallback(async () => {
    setEstado({ fase: "carregando" });
    try {
      const resposta = await fetch(enderecoDosDocumentos(lojaId), {
        cache: "no-store",
      });
      if (resposta.status === 404) {
        setEstado({ fase: "nao-encontrada" });
        return;
      }
      if (resposta.status === 401 || resposta.status === 403) {
        setEstado({
          fase: "erro",
          mensagem: MENSAGEM_DE_SESSAO_DOS_DOCUMENTOS,
        });
        return;
      }
      if (!resposta.ok) {
        setEstado({ fase: "erro", mensagem: MENSAGEM_DE_FALHA_DOS_DOCUMENTOS });
        return;
      }
      const { documentos } = esquemaDosDocumentosDaLoja.parse(
        await resposta.json(),
      );
      setEstado({ fase: "pronta", documentos });
    } catch {
      setEstado({ fase: "erro", mensagem: MENSAGEM_DE_FALHA_DOS_DOCUMENTOS });
    }
  }, [lojaId]);

  useEffect(() => {
    void carregar();
  }, [carregar, tentativa]);

  return (
    <DocumentosDaLojaNaTela
      lojaId={lojaId}
      estado={estado}
      aoTentarDeNovo={() => setTentativa((anterior) => anterior + 1)}
      aoEnviar={(documento) =>
        setEstado((anterior) =>
          anterior.fase === "pronta"
            ? {
                fase: "pronta",
                documentos: [
                  documento,
                  ...anterior.documentos.filter(
                    (existente) => existente.id !== documento.id,
                  ),
                ],
              }
            : anterior,
        )
      }
    />
  );
}
