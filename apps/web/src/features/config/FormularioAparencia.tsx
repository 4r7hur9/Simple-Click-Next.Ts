"use client";
/**
 * A apresentação da loja: nome, boas-vindas, sobre, logo, capa e cor
 * (US-904: AC-916, AC-917, AC-918).
 *
 * A PRÉVIA MOSTRA O RESULTADO ANTES DE PUBLICAR. Ela é desenhada com o mesmo
 * tema da vitrine (`TemaDaLoja`), então a cor, a letra ajustada para contraste
 * e as imagens que aparecem aqui são as que o cliente vai ver.
 *
 * COR CLARA DEMAIS NÃO É RECUSADA, é consertada: a vitrine troca a cor da letra
 * por cima dela para manter a leitura, e a tela AVISA o dono — conserto
 * silencioso ensina a escolher errado de novo (AC-917).
 *
 * A IMAGEM É CONFERIDA DUAS VEZES. Aqui, pelo tipo e pelo tamanho, para a
 * orientação aparecer na hora; na API, pelos bytes, que é quem decide. As
 * duas recusas dizem o mesmo: formatos aceitos, tamanho máximo e proporção
 * recomendada — e que a imagem anterior continua no ar (AC-918).
 */
import { useState } from "react";
import {
  Aviso,
  calcularTemaDaLoja,
  PALETA_CLARA,
  TemaDaLoja,
} from "@simpleclick/ui";
import {
  REGRAS_DAS_IMAGENS_DA_LOJA,
  type SecaoDeAparencia,
} from "@simpleclick/contracts";

import { atributosDeErro, ErroDoCampo } from "./ErroDoCampo.tsx";
import { useSecao } from "./useSecao.ts";

type TipoDeImagem = "logo" | "capa";

/** A apresentação como a tela a edita: texto vazio em vez de nulo. */
interface AparenciaNaTela {
  readonly nome: string;
  readonly boasVindas: string;
  readonly sobre: string;
  readonly logo: string;
  readonly capa: string;
  readonly corPrimaria: string;
}

/**
 * A cor do seletor quando a loja ainda não escolheu nenhuma: a do design
 * system, e não uma escrita aqui (AC-014).
 */
const COR_INICIAL = PALETA_CLARA.primaria;

const SEM_APARENCIA: AparenciaNaTela = {
  nome: "",
  boasVindas: "",
  sobre: "",
  logo: "",
  capa: "",
  corPrimaria: "",
};

function aparenciaDaApi(bruto: unknown): AparenciaNaTela {
  const lido = bruto as Partial<SecaoDeAparencia> | null;
  return {
    nome: lido?.nome ?? "",
    boasVindas: lido?.boasVindas ?? "",
    sobre: lido?.sobre ?? "",
    logo: lido?.logo ?? "",
    capa: lido?.capa ?? "",
    corPrimaria: lido?.corPrimaria ?? "",
  };
}

const nuloSeVazio = (texto: string): string | null =>
  texto.trim() === "" ? null : texto;

function aparenciaParaApi(aparencia: AparenciaNaTela): SecaoDeAparencia {
  return {
    nome: aparencia.nome,
    boasVindas: nuloSeVazio(aparencia.boasVindas),
    sobre: nuloSeVazio(aparencia.sobre),
    logo: nuloSeVazio(aparencia.logo),
    capa: nuloSeVazio(aparencia.capa),
    corPrimaria: nuloSeVazio(aparencia.corPrimaria),
  };
}

/** A frase de orientação de uma imagem, igual à que a API devolve. */
export function orientacaoDaImagem(tipo: TipoDeImagem): string {
  const regra = REGRAS_DAS_IMAGENS_DA_LOJA[tipo];
  const nome = tipo === "logo" ? "A logo" : "A capa";
  return `${nome} aceita ${regra.formatosAceitos.join(", ")} de até ${regra.tamanhoMaximo}, na proporção ${regra.proporcaoRecomendada}.`;
}

/**
 * Confere o arquivo escolhido antes de enviar. Nulo quando serve; a frase da
 * recusa quando não serve.
 */
export function conferirArquivo(
  tipo: TipoDeImagem,
  arquivo: File,
): string | null {
  const regra = REGRAS_DAS_IMAGENS_DA_LOJA[tipo];
  const ehImagemAceita = (regra.tiposDeConteudo as readonly string[]).includes(
    arquivo.type,
  );
  if (!ehImagemAceita) {
    return `O arquivo escolhido não é uma imagem aceita. ${orientacaoDaImagem(tipo)} A imagem anterior continua no ar.`;
  }
  if (arquivo.size > regra.tamanhoMaximoBytes) {
    return `O arquivo passa do tamanho permitido. ${orientacaoDaImagem(tipo)} A imagem anterior continua no ar.`;
  }
  return null;
}

const TEXTOS = {
  carregando: "Carregando apresentação…",
  carregada: "Apresentação carregada.",
  salva:
    "Apresentação publicada. A página da sua loja já mostra o que está na prévia.",
};

export function FormularioAparencia() {
  const secao = useSecao("aparencia", SEM_APARENCIA, aparenciaDaApi, TEXTOS);
  const { dados, mudar, erros } = secao;
  const [recusaDaImagem, setRecusaDaImagem] = useState<
    Partial<Record<TipoDeImagem, string>>
  >({});
  const [enviando, setEnviando] = useState<TipoDeImagem | null>(null);

  const cor = dados.corPrimaria === "" ? COR_INICIAL : dados.corPrimaria;
  const tema = calcularTemaDaLoja(cor);
  // A cor COMPROMETE A LEITURA quando ela mesma não serve de letra sobre o
  // fundo da página — é o caso da cor clara demais, que a vitrine precisa
  // escurecer onde ela vira texto. Trocar a letra por cima de uma cor escura
  // (branco sobre azul-marinho) é ajuste de rotina, e não vira aviso.
  const comprometeLeitura =
    tema.corPrincipalComoTexto.toLowerCase() !==
    tema.corPrincipal.toLowerCase();

  function mudarCampo(campo: keyof AparenciaNaTela, valor: string) {
    mudar((anterior) => ({ ...anterior, [campo]: valor }));
  }

  async function enviarImagem(tipo: TipoDeImagem, arquivo: File) {
    const recusa = conferirArquivo(tipo, arquivo);
    setRecusaDaImagem((anteriores) => ({
      ...anteriores,
      [tipo]: recusa ?? undefined,
    }));
    if (recusa !== null) return;

    setEnviando(tipo);
    try {
      const resposta = await fetch(`/api/loja/imagem/${tipo}`, {
        method: "PUT",
        headers: { "content-type": arquivo.type },
        body: arquivo,
      });
      const corpo = (await resposta.json().catch(() => ({}))) as {
        url?: string;
        mensagem?: string;
      };
      if (resposta.ok && typeof corpo.url === "string") {
        mudarCampo(tipo, corpo.url);
        return;
      }
      setRecusaDaImagem((anteriores) => ({
        ...anteriores,
        [tipo]:
          corpo.mensagem ??
          `Não foi possível enviar a imagem agora. ${orientacaoDaImagem(tipo)} A imagem anterior continua no ar.`,
      }));
    } finally {
      setEnviando(null);
    }
  }

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
          void secao.salvar(aparenciaParaApi(dados));
        }}
        className="space-y-6"
        noValidate
      >
        <div>
          <label className="block">
            <span className="font-medium">Nome de exibição</span>
            <input
              className="sc-campo mt-2 w-full"
              name="nome"
              value={dados.nome}
              maxLength={80}
              onChange={(evento) => mudarCampo("nome", evento.target.value)}
              {...atributosDeErro("nome", erros)}
            />
          </label>
          <ErroDoCampo campo="nome" erros={erros} />
        </div>
        <div>
          <label className="block">
            <span className="font-medium">Mensagem de boas-vindas</span>
            <textarea
              className="sc-campo mt-2 min-h-24 w-full"
              name="boasVindas"
              value={dados.boasVindas}
              maxLength={280}
              onChange={(evento) =>
                mudarCampo("boasVindas", evento.target.value)
              }
              {...atributosDeErro("boasVindas", erros)}
            />
          </label>
          <ErroDoCampo campo="boasVindas" erros={erros} />
        </div>
        <div>
          <label className="block">
            <span className="font-medium">Sobre o negócio</span>
            <textarea
              className="sc-campo mt-2 min-h-36 w-full"
              name="sobre"
              value={dados.sobre}
              maxLength={2_000}
              onChange={(evento) => mudarCampo("sobre", evento.target.value)}
              {...atributosDeErro("sobre", erros)}
            />
            <span className="mt-2 block text-sm text-[var(--cor-tinta-suave)]">
              Aparece na página Sobre da sua loja.
            </span>
          </label>
          <ErroDoCampo campo="sobre" erros={erros} />
        </div>

        {(["logo", "capa"] as const).map((tipo) => (
          <fieldset
            key={tipo}
            className="space-y-3 rounded-2xl border border-[var(--cor-borda)] p-4"
          >
            <legend className="px-2 font-medium">
              {tipo === "logo" ? "Logo" : "Imagem de capa"}
            </legend>
            <p className="text-sm text-[var(--cor-tinta-suave)]">
              {orientacaoDaImagem(tipo)}
            </p>
            <label className="block">
              <span className="text-sm">Enviar arquivo</span>
              <input
                className="mt-2 block w-full text-sm"
                type="file"
                name={`arquivo-${tipo}`}
                accept={REGRAS_DAS_IMAGENS_DA_LOJA[tipo].tiposDeConteudo.join(
                  ",",
                )}
                disabled={enviando !== null}
                onChange={(evento) => {
                  const arquivo = evento.target.files?.[0];
                  if (arquivo !== undefined) void enviarImagem(tipo, arquivo);
                  evento.target.value = "";
                }}
                aria-describedby={
                  recusaDaImagem[tipo] === undefined
                    ? undefined
                    : `recusa-${tipo}`
                }
              />
            </label>
            {enviando === tipo ? (
              <p className="text-sm" role="status">
                Enviando imagem…
              </p>
            ) : null}
            {recusaDaImagem[tipo] === undefined ? null : (
              <p
                id={`recusa-${tipo}`}
                className="text-sm font-medium text-[var(--cor-erro)]"
                role="alert"
              >
                {recusaDaImagem[tipo]}
              </p>
            )}
            <label className="block">
              <span className="text-sm">
                Ou o endereço de uma imagem já hospedada
              </span>
              <input
                className="sc-campo mt-2 w-full"
                type="url"
                name={tipo}
                value={dados[tipo]}
                placeholder="https://…"
                onChange={(evento) => mudarCampo(tipo, evento.target.value)}
                {...atributosDeErro(tipo, erros)}
              />
            </label>
            <ErroDoCampo campo={tipo} erros={erros} />
          </fieldset>
        ))}

        <div>
          <label className="flex items-center gap-3">
            <span className="font-medium">Cor principal</span>
            <input
              className="h-11 w-16 cursor-pointer rounded border border-[var(--cor-borda)]"
              type="color"
              name="corPrimaria"
              value={cor}
              onChange={(evento) =>
                mudarCampo("corPrimaria", evento.target.value)
              }
            />
            <code>{cor}</code>
          </label>
          <ErroDoCampo campo="corPrimaria" erros={erros} />
          {comprometeLeitura ? (
            <Aviso
              tom="atencao"
              titulo="Esta cor compromete a leitura"
              className="mt-3"
            >
              <p>
                A vitrine vai ajustar a cor do texto para ele continuar legível.
                Veja na prévia como ficou; se preferir, escolha uma cor mais
                escura.
              </p>
              <ul
                className="mt-2 list-disc pl-5 text-sm"
                data-avisos="contraste"
              >
                {tema.avisos.map((aviso) => (
                  <li key={aviso}>{aviso}</li>
                ))}
              </ul>
            </Aviso>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button
            className="sc-botao sc-botao--primario"
            type="submit"
            disabled={secao.salvando}
          >
            {secao.salvando ? "Publicando…" : "Publicar apresentação"}
          </button>
          <p role="status" className="text-sm text-[var(--cor-tinta-suave)]">
            {secao.mensagem}
          </p>
        </div>
      </form>

      <section aria-labelledby="titulo-previa-apresentacao">
        <h2 id="titulo-previa-apresentacao" className="font-medium">
          Prévia da página da loja
        </h2>
        <p className="mt-1 text-sm text-[var(--cor-tinta-suave)]">
          É assim que o cliente vai ver depois que você publicar.
        </p>
        <TemaDaLoja
          corPrincipal={cor}
          aoAvisar={() => undefined}
          className="mt-4 overflow-hidden rounded-2xl border border-[var(--cor-borda)] bg-[var(--cor-superficie)]"
        >
          <div data-previa="apresentacao">
            {dados.capa === "" ? null : (
              <img
                className="h-32 w-full object-cover"
                src={dados.capa}
                alt=""
                data-previa-capa=""
              />
            )}
            <div className="space-y-3 p-5">
              <div className="flex items-center gap-3">
                {dados.logo === "" ? null : (
                  <img
                    className="h-14 w-14 rounded-full object-cover"
                    src={dados.logo}
                    alt={`Logo de ${dados.nome}`}
                    data-previa-logo=""
                  />
                )}
                <p className="text-xl font-semibold" data-previa-nome="">
                  {dados.nome}
                </p>
              </div>
              {dados.boasVindas === "" ? null : (
                <p data-previa-boas-vindas="">{dados.boasVindas}</p>
              )}
              <span
                className="inline-block rounded-full bg-[var(--cor-primaria)] px-4 py-2 font-medium text-[var(--cor-em-primaria)]"
                data-previa-botao=""
              >
                Ver o cardápio
              </span>
              {dados.sobre === "" ? null : (
                <p
                  className="text-sm text-[var(--cor-tinta-suave)]"
                  data-previa-sobre=""
                >
                  {dados.sobre}
                </p>
              )}
            </div>
          </div>
        </TemaDaLoja>
      </section>
    </div>
  );
}
