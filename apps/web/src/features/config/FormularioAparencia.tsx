"use client";
/**
 * A personalização da loja pelo dono: cor de destaque, fotos, textos e
 * contato, com a prévia da vitrine ao lado (US-904: AC-916, AC-917, AC-918).
 *
 * O FUNDO DA LOJA É SEMPRE PRETO. O dono escolhe a COR DE DESTAQUE — a que
 * pinta os títulos em bloco, botões, filetes e selos — num seletor de
 * cor, e duas fotos: o fundo da vitrine (a página da loja) e o topo do
 * cardápio. Sem foto, vale a capa padrão do tipo de negócio.
 *
 * A PRÉVIA MOSTRA O RESULTADO ANTES DE PUBLICAR. Ela usa o mesmo envelope de
 * tema da vitrine, então a cor, a letra por cima dela e as fotos são as que o
 * cliente verá.
 *
 * COR RUIM NÃO É RECUSADA, é consertada e avisada (AC-917): a letra sobre a
 * cor é escolhida sozinha (grafite ou branca, contraste AA) e, se a cor for
 * escura demais para o fundo preto, a vitrine clareia só onde ela vira
 * texto — e a tela sugere uma cor parecida que aparece bem.
 *
 * O SELO ABERTO/FECHADO (card #64) é uma pílula clara ou escura sobre a capa.
 * No automático, a tela mede a cor de cada foto aqui e manda junto com o tema;
 * no manual, avisa quando a pílula escolhida se mistura com a foto.
 *
 * SALVAR grava três coisas, nesta ordem: contato, apresentação e tema. Se uma
 * falhar, a tela diz qual ficou de fora; o que já foi gravado continua.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Aviso,
  avaliarSelo,
  COR_DE_DESTAQUE_PADRAO_DA_LOJA,
  IconeRecortar,
  marcaDaLoja,
  PALETA_OFICIAL,
  PREFERENCIAS_DO_SELO,
  type AjusteDoRecorte,
  type PreferenciaDoSelo,
  type ResultadoDoRecorte,
} from "@simpleclick/ui";
import {
  esquemaDaRecusaDeConfiguracao,
  esquemaDosAjustesDasFotos,
  problemasPorCampo,
  REGRAS_DAS_IMAGENS_DA_LOJA,
  type AjusteDaFoto,
  type AjustesDasFotos,
  type ChaveDeAjusteDeFoto,
  type SecaoDeAparencia,
  type SecaoDeContato,
  ehEnderecoDeImagem,
} from "@simpleclick/contracts";

import { atributosDoSelo } from "../vitrine/SeloDeStatus.tsx";
import { medirCorDaImagem } from "./cor-da-imagem.ts";
import { atributosDeErro, ErroDoCampo } from "./ErroDoCampo.tsx";
import type { RascunhoDaVitrine } from "../../lib/rascunho-da-vitrine.ts";
import { type DadosDoContexto } from "./ContextoDaFoto.tsx";
import {
  ajusteParaORecorte,
  buscarFotoDaLoja,
  EnvioDeImagem,
} from "./EnvioDeImagem.tsx";
import {
  DicaDoEspaco,
  FORMATOS_DO_INPUT_DE_FOTO,
  useRecorteDeImagem,
} from "../recorte/RecorteDeImagem.tsx";
import { PreviaDaLojaReal } from "./PreviaDaLojaReal.tsx";
import { SeletorDeCor } from "./SeletorDeCor.tsx";
import { comInfo, InfoDoPainel, RotuloComInfo } from "./RotuloComInfo.tsx";
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

/** O contato como a tela o edita. */
interface ContatoNaTela {
  readonly numero: string;
  readonly saudacao: string;
  readonly publico: boolean;
}

/** O tema como a tela o edita: foto vazia é "usar a capa padrão". */
interface TemaNaTela {
  readonly corDestaque: string;
  readonly fundoVitrine: string;
  readonly topoCardapio: string;
  /** As versões das fotos para o celular; vazio: o celular usa a do computador. */
  readonly fundoVitrineCelular: string;
  readonly topoCardapioCelular: string;
  /** O original e o enquadramento de cada foto, para reabrir "Ajustar". */
  readonly ajustesDasFotos: AjustesDasFotos;
  readonly seloDeStatus: PreferenciaDoSelo;
  /** A cor medida de cada foto, pelo endereço. */
  readonly coresDasImagens: Readonly<Record<string, string>>;
}

/** As três escolhas do selo, como o dono as lê. */
const OPCOES_DO_SELO: Readonly<
  Record<PreferenciaDoSelo, { readonly rotulo: string; readonly ajuda: string }>
> = {
  AUTOMATICO: {
    rotulo: "Automático",
    ajuda: "Clara ou escura, a que mais aparece sobre a sua foto.",
  },
  CLARO: { rotulo: "Claro", ajuda: "Pílula branca, letra grafite." },
  ESCURO: { rotulo: "Escuro", ajuda: "Pílula preta, letra branca." },
};

const SEM_APARENCIA: AparenciaNaTela = {
  nome: "",
  boasVindas: "",
  sobre: "",
  logo: "",
  capa: "",
  corPrimaria: "",
};

const SEM_CONTATO: ContatoNaTela = { numero: "", saudacao: "", publico: true };

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

function contatoDaApi(bruto: unknown): ContatoNaTela {
  const lido = bruto as Partial<SecaoDeContato> | null;
  return {
    numero: lido?.numero ?? "",
    saudacao: lido?.saudacao ?? "",
    publico: lido?.publico ?? true,
  };
}

function temaDaApi(bruto: unknown): TemaNaTela {
  const lido = bruto as {
    corDestaque?: unknown;
    fundoVitrine?: unknown;
    topoCardapio?: unknown;
    fundoVitrineCelular?: unknown;
    topoCardapioCelular?: unknown;
    ajustesDasFotos?: unknown;
    seloDeStatus?: unknown;
    coresDasImagens?: unknown;
  } | null;
  const texto = (valor: unknown) => (typeof valor === "string" ? valor : "");
  const cores: Record<string, string> = {};
  if (typeof lido?.coresDasImagens === "object" && lido.coresDasImagens) {
    for (const [endereco, cor] of Object.entries(lido.coresDasImagens)) {
      if (typeof cor === "string" && /^#[0-9a-fA-F]{6}$/.test(cor))
        cores[endereco] = cor.toLowerCase();
    }
  }
  return {
    corDestaque:
      typeof lido?.corDestaque === "string" &&
      /^#[0-9a-fA-F]{6}$/.test(lido.corDestaque)
        ? lido.corDestaque.toLowerCase()
        : COR_DE_DESTAQUE_PADRAO_DA_LOJA,
    fundoVitrine: texto(lido?.fundoVitrine),
    topoCardapio: texto(lido?.topoCardapio),
    fundoVitrineCelular: texto(lido?.fundoVitrineCelular),
    topoCardapioCelular: texto(lido?.topoCardapioCelular),
    ajustesDasFotos: ajustesDaApi(lido?.ajustesDasFotos),
    seloDeStatus: (PREFERENCIAS_DO_SELO as readonly unknown[]).includes(
      lido?.seloDeStatus,
    )
      ? (lido?.seloDeStatus as PreferenciaDoSelo)
      : "AUTOMATICO",
    coresDasImagens: cores,
  };
}

/** A foto por trás do selo do cardápio: a do topo, senão a de fundo. */
const fotoDoTopo = (tema: TemaNaTela) =>
  tema.topoCardapio !== "" ? tema.topoCardapio : tema.fundoVitrine;

/** Junta as frases de erro dos dois campos de uma foto, sem repetir. */
const juntarErros = (...frases: readonly (string | undefined)[]) => {
  const unicas = [...new Set(frases.filter((f): f is string => !!f))];
  return unicas.length === 0 ? undefined : unicas.join(" ");
};

const nuloSeVazio = (texto: string): string | null =>
  texto.trim() === "" ? null : texto;

function aparenciaParaApi(
  aparencia: AparenciaNaTela,
  tema: TemaNaTela,
): SecaoDeAparencia {
  return {
    nome: aparencia.nome,
    boasVindas: nuloSeVazio(aparencia.boasVindas),
    sobre: nuloSeVazio(aparencia.sobre),
    logo: nuloSeVazio(aparencia.logo),
    // A capa antiga é a foto de fundo da vitrine: as duas andam juntas, e
    // assim "remover" de fato volta à capa padrão.
    capa: nuloSeVazio(tema.fundoVitrine),
    // A cor antiga acompanha a de destaque, para quem ainda a lê.
    corPrimaria: tema.corDestaque,
  };
}

/** Os ajustes com o de uma foto trocado (nulo tira o ajuste dela). */
function comAjuste(
  ajustes: AjustesDasFotos,
  chave: ChaveDeAjusteDeFoto,
  ajuste: AjusteDaFoto | null,
): AjustesDasFotos {
  const { [chave]: _antigo, ...resto } = ajustes;
  return ajuste === null ? resto : { ...resto, [chave]: ajuste };
}

/** Os ajustes que a API devolveu (os que não passam no esquema somem). */
function ajustesDaApi(bruto: unknown): AjustesDasFotos {
  const lido = esquemaDosAjustesDasFotos.safeParse(bruto);
  return lido.success ? lido.data : {};
}

/** Só os ajustes cuja foto ainda é a que está no ar: foto trocada, ajuste velho. */
function ajustesEmVigor(tema: TemaNaTela, logo: string): AjustesDasFotos {
  const vigentes: AjustesDasFotos = {};
  const { fundoVitrine, topoCardapio, logo: daLogo } = tema.ajustesDasFotos;
  if (
    fundoVitrine?.computador === tema.fundoVitrine &&
    tema.fundoVitrine !== ""
  )
    vigentes.fundoVitrine = fundoVitrine;
  if (
    topoCardapio?.computador === tema.topoCardapio &&
    tema.topoCardapio !== ""
  )
    vigentes.topoCardapio = topoCardapio;
  if (daLogo?.computador === logo && logo !== "") vigentes.logo = daLogo;
  return vigentes;
}

function temaParaApi(tema: TemaNaTela, logo: string) {
  // Só as cores das fotos em uso: foto trocada leva a cor junto.
  const coresDasImagens: Record<string, string> = {};
  for (const foto of [tema.fundoVitrine, tema.topoCardapio]) {
    const cor = tema.coresDasImagens[foto];
    if (ehEnderecoDeImagem(foto) && cor !== undefined)
      coresDasImagens[foto] = cor;
  }
  return {
    corDestaque: tema.corDestaque,
    fundoVitrine: nuloSeVazio(tema.fundoVitrine),
    topoCardapio: nuloSeVazio(tema.topoCardapio),
    fundoVitrineCelular: nuloSeVazio(tema.fundoVitrineCelular),
    topoCardapioCelular: nuloSeVazio(tema.topoCardapioCelular),
    ajustesDasFotos: ajustesEmVigor(tema, logo),
    seloDeStatus: tema.seloDeStatus,
    coresDasImagens,
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
  carregando: "Carregando a aparência…",
  carregada: "Aparência carregada.",
  salva: "",
};

const TEXTOS_DO_CONTATO = {
  carregando: "Carregando o contato…",
  carregada: "Contato carregado.",
  salva: "",
};

const MENSAGEM_DE_SUCESSO =
  "Aparência publicada. A página da sua loja já mostra o que está na prévia.";

const arredondar = (valor: number) => valor.toFixed(1).replace(".", ",");

export interface FormularioAparenciaProps {
  /** O apelido da loja: a prévia abre a loja pública dela. */
  readonly apelido?: string | undefined;
  /** Como a loja chama o catálogo: "Cardápio", "Catálogo". */
  readonly rotuloDoCatalogo?: string | undefined;
}

export function FormularioAparencia({
  apelido = "",
  rotuloDoCatalogo = "Cardápio",
}: FormularioAparenciaProps = {}) {
  const aparencia = useSecao(
    "aparencia",
    SEM_APARENCIA,
    aparenciaDaApi,
    TEXTOS,
  );
  const contato = useSecao(
    "contato",
    SEM_CONTATO,
    contatoDaApi,
    TEXTOS_DO_CONTATO,
  );
  const { dados, mudar, erros } = aparencia;

  const [tema, setTema] = useState<TemaNaTela | null>(null);
  const [temaFalhou, setTemaFalhou] = useState(false);
  const [errosDoTema, setErrosDoTema] = useState<Record<string, string>>({});
  const [recusaDaLogo, setRecusaDaLogo] = useState<string | null>(null);
  const [enviandoLogo, setEnviandoLogo] = useState(false);
  // A logo escolhida aparece na hora, antes mesmo de o envio terminar.
  const [previaDaLogo, setPreviaDaLogo] = useState<string | null>(null);
  // Reabrindo "Ajustar" na logo: o enquadramento de agora e o original guardado.
  const [reedicaoDaLogo, setReedicaoDaLogo] = useState<{
    readonly ajuste: AjusteDoRecorte | undefined;
    readonly originalGuardado: string | null;
  } | null>(null);
  const [abrindoALogo, setAbrindoALogo] = useState(false);
  const [avisoDaLogo, setAvisoDaLogo] = useState<string | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [alterado, setAlterado] = useState(false);

  // O que está no ar, para só gravar o contato quando ele mudou.
  const contatoNoAr = useRef<ContatoNaTela | null>(null);
  const fundoMesclado = useRef(false);

  useEffect(() => {
    let ativo = true;
    void fetch("/api/loja/tema", { cache: "no-store" })
      .then(async (resposta) => {
        if (!resposta.ok) throw new Error(String(resposta.status));
        return temaDaApi(await resposta.json());
      })
      .then((lido) => {
        if (ativo) setTema(lido);
      })
      .catch(() => {
        if (ativo) setTemaFalhou(true);
      });
    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    if (contato.fase === "pronta" && contatoNoAr.current === null) {
      contatoNoAr.current = contato.dados;
    }
  }, [contato.fase, contato.dados]);

  // A capa antiga vale como foto de fundo enquanto o tema não tem a dele.
  useEffect(() => {
    if (fundoMesclado.current) return;
    if (tema === null || aparencia.fase !== "pronta") return;
    fundoMesclado.current = true;
    if (tema.fundoVitrine === "" && dados.capa !== "") {
      setTema({ ...tema, fundoVitrine: dados.capa });
    }
  }, [tema, aparencia.fase, dados.capa]);

  const mudarCampo = useCallback(
    (campo: keyof AparenciaNaTela, valor: string) => {
      setAlterado(true);
      mudar((anterior) => ({ ...anterior, [campo]: valor }));
    },
    [mudar],
  );

  const mudarTema = useCallback((parte: Partial<TemaNaTela>) => {
    setAlterado(true);
    setTema((anterior) =>
      anterior === null ? anterior : { ...anterior, ...parte },
    );
  }, []);

  // Mede a cor das fotos que ainda não têm: é o que o selo automático usa.
  const fundoAtual = tema?.fundoVitrine ?? "";
  const topoAtual = tema?.topoCardapio ?? "";
  useEffect(() => {
    let ativo = true;
    for (const foto of [fundoAtual, topoAtual]) {
      if (foto === "" || tema?.coresDasImagens[foto] !== undefined) continue;
      void medirCorDaImagem(foto).then((cor) => {
        if (!ativo || cor === null) return;
        setTema((anterior) =>
          anterior === null
            ? anterior
            : {
                ...anterior,
                coresDasImagens: { ...anterior.coresDasImagens, [foto]: cor },
              },
        );
      });
    }
    return () => {
      ativo = false;
    };
    // As cores entram no tema por esta mesma medição; só a troca de foto mede.
  }, [fundoAtual, topoAtual]);

  // O que a prévia "como vai aparecer" do modal de foto mostra por cima dela.
  const contextoDasFotos = useMemo<DadosDoContexto>(
    () => ({
      nome: dados.nome,
      logo: dados.logo,
      boasVindas: dados.boasVindas,
      rotuloDoCatalogo,
      corDestaque: tema?.corDestaque ?? COR_DE_DESTAQUE_PADRAO_DA_LOJA,
    }),
    [
      dados.nome,
      dados.logo,
      dados.boasVindas,
      rotuloDoCatalogo,
      tema?.corDestaque,
    ],
  );

  /**
   * Recebe a logo já recortada (512 × 512, WebP) e a envia. A frase de erro
   * volta para a janela de recorte, que continua aberta para tentar de novo, e
   * também fica na tela, para quem fechar a janela.
   */
  async function enviarLogo(
    arquivo: File,
    _original: File,
    resultado: ResultadoDoRecorte,
  ): Promise<string | undefined> {
    setRecusaDaLogo(null);
    setAvisoDaLogo(null);
    setEnviandoLogo(true);
    const provisoria = URL.createObjectURL(arquivo);
    setPreviaDaLogo(provisoria);
    try {
      const resposta = await fetch("/api/loja/imagem/logo", {
        method: "PUT",
        headers: { "content-type": arquivo.type },
        body: arquivo,
      });
      const corpo = (await resposta.json().catch(() => ({}))) as {
        url?: string;
        mensagem?: string;
      };
      if (resposta.ok && typeof corpo.url === "string") {
        mudarCampo("logo", corpo.url);
        // O original da logo fica guardado para reabrir o ajuste sem perda.
        let enderecoDoOriginal = reedicaoDaLogo?.originalGuardado ?? null;
        if (resultado.original !== undefined && enderecoDoOriginal === null) {
          const guardado = await fetch("/api/loja/imagem/original", {
            method: "PUT",
            headers: { "content-type": resultado.original.type },
            body: resultado.original,
          });
          const dadosDoOriginal = (await guardado.json().catch(() => ({}))) as {
            url?: string;
          };
          if (guardado.ok && typeof dadosDoOriginal.url === "string")
            enderecoDoOriginal = dadosDoOriginal.url;
        }
        setTema((anterior) =>
          anterior === null
            ? anterior
            : {
                ...anterior,
                ajustesDasFotos: comAjuste(
                  anterior.ajustesDasFotos,
                  "logo",
                  enderecoDoOriginal === null
                    ? null
                    : {
                        original: enderecoDoOriginal,
                        computador: corpo.url ?? "",
                        celular: null,
                        iguais: true,
                        fundo:
                          resultado.ajuste.fundo.tipo === "cor"
                            ? { tipo: "cor", cor: resultado.ajuste.fundo.cor }
                            : { tipo: resultado.ajuste.fundo.tipo },
                        estados: resultado.ajuste.estados,
                      },
                ),
              },
        );
        setReedicaoDaLogo(null);
        setAvisoDaLogo(
          "Logo enviada e já publicada na loja. O resto só vai ao ar quando você clicar em Salvar e publicar.",
        );
        return undefined;
      }
      const recusa =
        corpo.mensagem ??
        `Não foi possível enviar a imagem agora. ${orientacaoDaImagem("logo")} A imagem anterior continua no ar.`;
      setRecusaDaLogo(recusa);
      return recusa;
    } catch {
      const recusa =
        "Não foi possível enviar a imagem agora: a conexão falhou. A imagem anterior continua no ar.";
      setRecusaDaLogo(recusa);
      return recusa;
    } finally {
      // Sai a prévia provisória: vale a imagem que o servidor guardou (ou a
      // anterior, se o envio falhou).
      setPreviaDaLogo(null);
      URL.revokeObjectURL(provisoria);
      setEnviandoLogo(false);
    }
  }

  // A logo passa pela janela de recorte (1:1, círculo nos stories) antes do envio.
  const recorteDaLogo = useRecorteDeImagem({
    espaco: "logo",
    ajusteInicial: reedicaoDaLogo?.ajuste,
    guardarOriginal: true,
    aoCancelar: () => setReedicaoDaLogo(null),
    aoRecortar: enviarLogo,
    aoRecusar: (motivo) => {
      setAvisoDaLogo(null);
      setRecusaDaLogo(
        motivo === null ? null : `${motivo} A imagem anterior continua no ar.`,
      );
    },
  });

  /** "Ajustar" na logo: reabre a janela com a logo atual e o ajuste de agora. */
  async function reabrirALogo() {
    setRecusaDaLogo(null);
    setAvisoDaLogo(null);
    setAbrindoALogo(true);
    try {
      const guardado = tema?.ajustesDasFotos.logo;
      const vale = guardado !== undefined && guardado.computador === dados.logo;
      const arquivo = await buscarFotoDaLoja(
        vale ? guardado.original : dados.logo,
        "logo",
      );
      setReedicaoDaLogo({
        ajuste: vale ? ajusteParaORecorte(guardado) : undefined,
        originalGuardado: vale ? guardado.original : null,
      });
      recorteDaLogo.escolher([arquivo]);
    } catch {
      setRecusaDaLogo(
        "Não consegui abrir a logo atual para ajustar. Escolha o arquivo de novo.",
      );
    } finally {
      setAbrindoALogo(false);
    }
  }

  async function publicar() {
    if (tema === null) return;
    setPublicando(true);
    setMensagem("Salvando…");
    setErrosDoTema({});
    const gravados: string[] = [];
    const naoGravados: string[] = [];
    try {
      // 1. Contato — só se mudou.
      const noAr = contatoNoAr.current;
      const contatoMudou =
        noAr === null ||
        noAr.numero !== contato.dados.numero ||
        noAr.publico !== contato.dados.publico;
      if (contatoMudou) {
        const ok = await contato.salvar(
          {
            numero: contato.dados.numero,
            saudacao: nuloSeVazio(contato.dados.saudacao),
            publico: contato.dados.publico,
          },
          "",
        );
        if (!ok) {
          setMensagem(
            "Nada foi salvo. Corrija o WhatsApp marcado — a configuração anterior continua valendo.",
          );
          return;
        }
        contatoNoAr.current = contato.dados;
        gravados.push("o WhatsApp");
      }

      // 2. Apresentação.
      const okAparencia = await aparencia.salvar(
        aparenciaParaApi(dados, tema),
        "",
      );
      if (!okAparencia) {
        setMensagem(
          gravados.length > 0
            ? `Salvei ${gravados.join(" e ")}, mas os textos precisam de ajuste: corrija os campos marcados. O restante continua como estava.`
            : "Nada foi salvo. Corrija os campos marcados — a configuração anterior continua valendo.",
        );
        return;
      }
      gravados.push("os textos");

      // 3. Tema (cor e fotos).
      try {
        const resposta = await fetch("/api/loja/tema", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(temaParaApi(tema, dados.logo)),
        });
        if (resposta.ok) {
          setTema(temaDaApi(await resposta.json().catch(() => null)));
          setAlterado(false);
          setMensagem(MENSAGEM_DE_SUCESSO);
          return;
        }
        const recusa = esquemaDaRecusaDeConfiguracao.safeParse(
          await resposta.json().catch(() => null),
        );
        if (resposta.status === 400 && recusa.success) {
          setErrosDoTema(problemasPorCampo(recusa.data.campos));
        }
        naoGravados.push("a cor e as fotos");
      } catch {
        naoGravados.push("a cor e as fotos");
      }
      setMensagem(
        `Salvei ${gravados.join(" e ")}, mas não consegui salvar ${naoGravados.join(" e ")}. Corrija e tente de novo; o que já foi salvo continua valendo.`,
      );
    } finally {
      setPublicando(false);
    }
  }

  if (aparencia.fase === "falhou" || contato.fase === "falhou" || temaFalhou) {
    return (
      <p className="mt-8" role="alert">
        Não foi possível carregar a aparência da loja. Entre novamente para
        editá-la.
      </p>
    );
  }
  if (
    aparencia.fase !== "pronta" ||
    contato.fase !== "pronta" ||
    tema === null
  ) {
    return (
      <p className="mt-8" role="status">
        {TEXTOS.carregando}
      </p>
    );
  }

  // O que a prévia (a loja de verdade) recebe: o formulário como está agora.
  const emUso = [
    tema.fundoVitrine,
    tema.fundoVitrineCelular,
    tema.topoCardapio,
    tema.topoCardapioCelular,
  ];
  const coresEmUso: Record<string, string> = {};
  for (const endereco of emUso) {
    const cor = tema.coresDasImagens[endereco];
    if (endereco !== "" && cor !== undefined) coresEmUso[endereco] = cor;
  }
  const rascunhoDaPrevia: RascunhoDaVitrine = {
    apelido,
    nome: dados.nome,
    boasVindas: dados.boasVindas,
    logo: dados.logo,
    corDestaque: tema.corDestaque,
    fundoVitrine: tema.fundoVitrine,
    fundoVitrineCelular: tema.fundoVitrineCelular,
    topoCardapio: tema.topoCardapio,
    topoCardapioCelular: tema.topoCardapioCelular,
    seloDeStatus: tema.seloDeStatus,
    coresDasImagens: coresEmUso,
  };

  const marca = marcaDaLoja(tema.corDestaque);
  const idDaMensagem = "estado-da-aparencia";
  const corDoFundo = tema.coresDasImagens[tema.fundoVitrine] ?? null;
  const corDoTopo = tema.coresDasImagens[fotoDoTopo(tema)] ?? null;
  // O selo aparece nas duas fotos: avisa quando se mistura com alguma.
  const selosQueSomem = [
    { onde: "na página da loja", cor: corDoFundo },
    { onde: `no topo do ${rotuloDoCatalogo.toLowerCase()}`, cor: corDoTopo },
  ].filter(({ cor }) => !avaliarSelo(tema.seloDeStatus, cor).destacada);

  return (
    <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
      <form
        onSubmit={(evento) => {
          evento.preventDefault();
          void publicar();
        }}
        className="space-y-6"
        noValidate
      >
        <section
          className="space-y-4 rounded-3xl border border-[var(--cor-borda)] p-5"
          aria-labelledby="titulo-cor-de-destaque"
        >
          <div>
            <div className="flex items-center gap-2">
              <h2 id="titulo-cor-de-destaque" className="text-xl font-semibold">
                Cor de destaque
              </h2>
              <InfoDoPainel explicacao="corDeDestaque" nome="Cor de destaque" />
            </div>
            <p className="mt-1 text-sm text-[var(--cor-tinta-suave)]">
              O fundo da sua loja é sempre preto. Esta é a cor dos títulos em
              bloco, botões, filetes e selos. A luz de “Aberto” é sempre verde.
            </p>
          </div>
          <SeletorDeCor
            valor={tema.corDestaque}
            aoMudar={(hex) => mudarTema({ corDestaque: hex })}
            padrao={COR_DE_DESTAQUE_PADRAO_DA_LOJA}
          />
          <p
            className="text-sm text-[var(--cor-tinta-suave)]"
            data-letra-sobre-cor=""
          >
            A letra por cima da cor é{" "}
            <strong className="text-[var(--cor-tinta)]">
              {marca.corSobreMarca === PALETA_OFICIAL.branco
                ? "branca"
                : "grafite"}
            </strong>{" "}
            (contraste {arredondar(marca.relacaoSobreMarca)}:1, acima do mínimo
            de 4,5:1).
          </p>
          <ErroDoCampo campo="corDestaque" erros={errosDoTema} />
          {marca.avisos.length > 0 ? (
            <Aviso tom="atencao" titulo="Esta cor compromete a leitura">
              <ul className="list-disc pl-5 text-sm" data-avisos="contraste">
                {marca.avisos.map((aviso) => (
                  <li key={aviso}>{aviso}</li>
                ))}
              </ul>
              {marca.corSugerida === null ? null : (
                <button
                  type="button"
                  className="sc-botao sc-botao--secundaria sc-botao--pequeno mt-3"
                  onClick={() =>
                    mudarTema({ corDestaque: marca.corSugerida ?? "" })
                  }
                >
                  Usar a cor sugerida ({marca.corSugerida})
                </button>
              )}
            </Aviso>
          ) : null}
        </section>

        <section
          className="space-y-4 rounded-3xl border border-[var(--cor-borda)] p-5"
          aria-labelledby="titulo-fotos"
        >
          <div>
            <h2 id="titulo-fotos" className="text-xl font-semibold">
              Fotos
            </h2>
            <p className="mt-1 text-sm text-[var(--cor-tinta-suave)]">
              Sem foto, a loja usa a capa padrão do seu tipo de negócio, na cor
              de destaque.
            </p>
          </div>
          <EnvioDeImagem
            tipo="fundo"
            titulo="Foto de fundo da vitrine"
            explicacao="fotoDeFundo"
            ajuda="Aparece no alto da página da loja, atrás do nome e do texto de boas-vindas (a esquerda fica mais escura)."
            valor={tema.fundoVitrine}
            valorCelular={tema.fundoVitrineCelular}
            ajuste={tema.ajustesDasFotos.fundoVitrine}
            aoMudar={(computador, celular, ajuste) =>
              mudarTema({
                fundoVitrine: computador,
                fundoVitrineCelular: celular,
                ajustesDasFotos: comAjuste(
                  tema.ajustesDasFotos,
                  "fundoVitrine",
                  ajuste,
                ),
              })
            }
            contexto={contextoDasFotos}
            erro={juntarErros(
              errosDoTema["fundoVitrine"],
              errosDoTema["fundoVitrineCelular"],
            )}
          />
          <EnvioDeImagem
            tipo="topo"
            titulo="Foto do topo do cardápio"
            explicacao="fotoDoTopo"
            ajuda={`Aparece no alto do ${rotuloDoCatalogo.toLowerCase()}. Sem ela, vale a foto de fundo da vitrine.`}
            valor={tema.topoCardapio}
            valorCelular={tema.topoCardapioCelular}
            ajuste={tema.ajustesDasFotos.topoCardapio}
            aoMudar={(computador, celular, ajuste) =>
              mudarTema({
                topoCardapio: computador,
                topoCardapioCelular: celular,
                ajustesDasFotos: comAjuste(
                  tema.ajustesDasFotos,
                  "topoCardapio",
                  ajuste,
                ),
              })
            }
            contexto={contextoDasFotos}
            erro={juntarErros(
              errosDoTema["topoCardapio"],
              errosDoTema["topoCardapioCelular"],
            )}
          />
        </section>

        <section
          className="space-y-4 rounded-3xl border border-[var(--cor-borda)] p-5"
          aria-labelledby="titulo-selo-de-status"
        >
          <div>
            <div className="flex items-center gap-2">
              <h2 id="titulo-selo-de-status" className="text-xl font-semibold">
                Selo de status
              </h2>
              <InfoDoPainel explicacao="seloDeStatus" nome="Selo de status" />
            </div>
            <p className="mt-1 text-sm text-[var(--cor-tinta-suave)]">
              O “Aberto” e o “Fechado” que ficam sobre as suas fotos. A luz é
              verde quando a loja está aberta e vermelha quando está fechada,
              sempre com o texto ao lado.
            </p>
          </div>
          <fieldset className="grid gap-3 sm:grid-cols-3">
            <legend className="sr-only">Cor do selo de status</legend>
            {PREFERENCIAS_DO_SELO.map((opcao) => {
              const exemplo = atributosDoSelo({
                preferencia: opcao,
                corDoFundo: corDoTopo,
                aberta: true,
              });
              const escolhida = tema.seloDeStatus === opcao;
              return (
                <label
                  key={opcao}
                  className={`flex cursor-pointer flex-col gap-3 rounded-2xl border p-4 ${
                    escolhida
                      ? "border-[var(--cor-primaria)] bg-[var(--cor-superficie)]"
                      : "border-[var(--cor-borda)]"
                  }`}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <input
                      type="radio"
                      name="seloDeStatus"
                      value={opcao}
                      checked={escolhida}
                      onChange={() => mudarTema({ seloDeStatus: opcao })}
                    />
                    {OPCOES_DO_SELO[opcao].rotulo}
                  </span>
                  <span className="text-sm text-[var(--cor-tinta-suave)]">
                    {OPCOES_DO_SELO[opcao].ajuda}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`${exemplo.className} text-xs font-bold uppercase tracking-[0.12em]`}
                    style={exemplo.style}
                    data-selo={exemplo["data-selo"]}
                    data-exemplo-do-selo={opcao}
                  >
                    <span className="sc-vitrine__capa-ponto size-2 rounded-full" />
                    Aberto
                  </span>
                </label>
              );
            })}
          </fieldset>
          <ErroDoCampo campo="seloDeStatus" erros={errosDoTema} />
          {selosQueSomem.length > 0 ? (
            <Aviso tom="atencao" titulo="O selo vai se misturar com a foto">
              <p className="text-sm" data-avisos="selo-de-status">
                Com o selo{" "}
                {OPCOES_DO_SELO[tema.seloDeStatus].rotulo.toLowerCase()}, o
                contraste com a foto fica abaixo do mínimo de 3:1{" "}
                {selosQueSomem.map(({ onde }) => onde).join(" e ")}. O texto
                continua legível, mas o selo perde destaque.
              </p>
              <button
                type="button"
                className="sc-botao sc-botao--secundaria sc-botao--pequeno mt-3"
                onClick={() => mudarTema({ seloDeStatus: "AUTOMATICO" })}
              >
                Usar o automático
              </button>
            </Aviso>
          ) : null}
        </section>

        <section
          className="space-y-5 rounded-3xl border border-[var(--cor-borda)] p-5"
          aria-labelledby="titulo-textos"
        >
          <h2 id="titulo-textos" className="text-xl font-semibold">
            Nome, descrição e logo
          </h2>
          <div>
            <label className="block">
              <span className="font-medium">Nome da loja</span>
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
            <RotuloComInfo
              para="aparencia-boasVindas"
              explicacao="descricaoCurta"
              nome="Descrição curta"
              className="font-medium"
            >
              Descrição curta
            </RotuloComInfo>
            <div className="block">
              <textarea
                id="aparencia-boasVindas"
                className="sc-campo mt-2 min-h-24 w-full"
                name="boasVindas"
                value={dados.boasVindas}
                maxLength={280}
                onChange={(evento) =>
                  mudarCampo("boasVindas", evento.target.value)
                }
                {...comInfo(
                  "aparencia-boasVindas",
                  atributosDeErro("boasVindas", erros),
                )}
              />
              <span className="mt-2 block text-sm text-[var(--cor-tinta-suave)]">
                A frase de boas-vindas na página da loja (
                {dados.boasVindas.length}/280).
              </span>
            </div>
            <ErroDoCampo campo="boasVindas" erros={erros} />
          </div>
          <div>
            <RotuloComInfo
              para="aparencia-sobre"
              explicacao="sobreONegocio"
              nome="Sobre o negócio"
              className="font-medium"
            >
              Sobre o negócio
            </RotuloComInfo>
            <div className="block">
              <textarea
                id="aparencia-sobre"
                className="sc-campo mt-2 min-h-36 w-full"
                name="sobre"
                value={dados.sobre}
                maxLength={2_000}
                onChange={(evento) => mudarCampo("sobre", evento.target.value)}
                {...comInfo("aparencia-sobre", atributosDeErro("sobre", erros))}
              />
              <span className="mt-2 block text-sm text-[var(--cor-tinta-suave)]">
                Aparece na página Sobre da sua loja.
              </span>
            </div>
            <ErroDoCampo campo="sobre" erros={erros} />
          </div>

          <fieldset
            id="foto-de-perfil"
            className="scroll-mt-24 space-y-3 rounded-2xl border border-[var(--cor-borda)] p-4"
            {...recorteDaLogo.soltar}
          >
            <legend className="flex items-center gap-1.5 px-2 font-medium">
              Logo (foto de perfil)
              <InfoDoPainel explicacao="logo" nome="Logo" />
            </legend>
            <p className="text-sm text-[var(--cor-tinta-suave)]">
              É a foto de perfil da loja: aparece na bolinha dos stories e no
              topo dos posts em Explorar.
            </p>
            <DicaDoEspaco espaco="logo" />
            <label className="block">
              <span className="text-sm">Enviar arquivo</span>
              <input
                className="sc-campo__controle mt-2 block w-full text-sm"
                type="file"
                name="arquivo-logo"
                accept={FORMATOS_DO_INPUT_DE_FOTO}
                disabled={enviandoLogo}
                onChange={(evento) => {
                  setReedicaoDaLogo(null);
                  recorteDaLogo.escolher(evento.target.files);
                  evento.target.value = "";
                }}
                aria-describedby={
                  recusaDaLogo === null ? undefined : "recusa-logo"
                }
              />
            </label>
            {dados.logo !== "" && previaDaLogo === null ? (
              <button
                type="button"
                className="sc-botao sc-botao--secundaria"
                disabled={enviandoLogo || abrindoALogo}
                onClick={() => void reabrirALogo()}
                data-ajustar="logo"
              >
                <IconeRecortar size={18} />
                {abrindoALogo ? "Abrindo…" : "Ajustar a logo"}
              </button>
            ) : null}
            {previaDaLogo !== null || dados.logo !== "" ? (
              <img
                // A chave é o endereço: logo nova monta uma imagem nova.
                key={previaDaLogo ?? dados.logo}
                src={previaDaLogo ?? dados.logo}
                alt={
                  previaDaLogo === null
                    ? "Logo atual da loja"
                    : "Logo escolhida"
                }
                className="size-20 rounded-2xl border border-[var(--cor-borda)] object-cover"
                data-logo-atual=""
              />
            ) : null}
            {enviandoLogo ? (
              <p className="text-sm" role="status">
                Enviando imagem…
              </p>
            ) : avisoDaLogo !== null && recusaDaLogo === null ? (
              <p
                className="text-sm font-medium text-[var(--cor-primaria)]"
                role="status"
              >
                {avisoDaLogo}
              </p>
            ) : null}
            {recusaDaLogo === null ? null : (
              <p
                id="recusa-logo"
                className="text-sm font-medium text-[var(--cor-erro)]"
                role="alert"
              >
                {recusaDaLogo}
              </p>
            )}
            <label className="block">
              <span className="text-sm">
                Ou o endereço de uma imagem já hospedada
              </span>
              <input
                className="sc-campo mt-2 w-full"
                type="url"
                name="logo"
                value={dados.logo}
                placeholder="https://…"
                onChange={(evento) => {
                  setAvisoDaLogo(null);
                  mudarCampo("logo", evento.target.value);
                }}
                {...atributosDeErro("logo", erros)}
              />
            </label>
            <ErroDoCampo campo="logo" erros={erros} />
            {recorteDaLogo.janela}
          </fieldset>
        </section>

        <section
          className="space-y-4 rounded-3xl border border-[var(--cor-borda)] p-5"
          aria-labelledby="titulo-contato"
        >
          <h2 id="titulo-contato" className="text-xl font-semibold">
            WhatsApp
          </h2>
          <div>
            <label className="block">
              <span className="font-medium">Número do WhatsApp da loja</span>
              <input
                className="sc-campo mt-2 w-full"
                name="numero"
                type="tel"
                inputMode="tel"
                value={contato.dados.numero}
                maxLength={30}
                placeholder="(11) 91234-5678"
                onChange={(evento) => {
                  setAlterado(true);
                  contato.mudar((anterior) => ({
                    ...anterior,
                    numero: evento.target.value,
                  }));
                }}
                {...atributosDeErro("numero", contato.erros)}
              />
            </label>
            <ErroDoCampo campo="numero" erros={contato.erros} />
          </div>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              name="publico"
              className="size-5 accent-[var(--cor-primaria)]"
              checked={contato.dados.publico}
              onChange={(evento) => {
                setAlterado(true);
                contato.mudar((anterior) => ({
                  ...anterior,
                  publico: evento.target.checked,
                }));
              }}
            />
            <span>Mostrar o número na página da loja</span>
          </label>
          <p className="text-sm text-[var(--cor-tinta-suave)]">
            Redes sociais ainda não têm campo próprio; por enquanto, conte o
            endereço delas no texto “Sobre”.
          </p>
        </section>

        <div className="flex flex-wrap items-center gap-4">
          <button
            className="sc-botao sc-botao--primaria"
            type="submit"
            disabled={publicando || enviandoLogo}
          >
            {publicando ? "Salvando…" : "Salvar e publicar"}
          </button>
          <p
            id={idDaMensagem}
            role="status"
            className="text-sm text-[var(--cor-tinta-suave)]"
          >
            {mensagem !== ""
              ? mensagem
              : alterado
                ? "Há alterações que ainda não foram publicadas."
                : ""}
          </p>
        </div>
      </form>

      <aside
        className="order-first min-w-0 xl:order-last"
        aria-labelledby="titulo-previa-apresentacao"
      >
        <h2 id="titulo-previa-apresentacao" className="font-medium">
          Prévia da loja
        </h2>
        <p className="mt-1 text-sm text-[var(--cor-tinta-suave)]">
          É a sua loja de verdade, com o que você está editando. Muda enquanto
          você edita; o cliente só vê depois que você salvar.
        </p>
        <div className="mt-4">
          <PreviaDaLojaReal rascunho={rascunhoDaPrevia} />
        </div>
      </aside>
    </div>
  );
}
