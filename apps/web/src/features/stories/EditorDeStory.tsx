"use client";

import { COR_DE_DESTAQUE_PADRAO, type LimitesDeMidia } from "@simpleclick/contracts";
import {
  IconeAdesivo,
  IconeDesenhar,
  IconeDesfazer,
  IconeEnquadrar,
  IconeFechar,
  IconeRefazer,
  IconeTexto,
} from "@simpleclick/ui";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

import {
  enviarComProgresso,
  explicarRecusaDoEnvio,
  lerDadosDoVideo,
} from "../../lib/envio-de-midia.ts";
import { BandejaDeAdesivos, type BuscarProdutos } from "./BandejaDeAdesivos.tsx";
import { EditorDeTexto, type ParteDoTexto } from "./EditorDeTexto.tsx";
import { FerramentasDeDesenho } from "./FerramentasDeDesenho.tsx";
import { FolhaDePublicar, type EstadoDoEnvio } from "./FolhaDePublicar.tsx";
import { PalcoDoStory } from "./PalcoDoStory.tsx";
import { TelaDeCaptura, type CapturaFeita } from "./TelaDeCaptura.tsx";
import {
  comporFoto,
  exportarFoto,
  precisaComporOVideo,
} from "./composicao.ts";
import { comporVideo, composicaoDeVideoSuportada } from "./composicao-de-video.ts";
import {
  BRANCO,
  ESPESSURAS_DO_PINCEL,
  adicionarCamada,
  atualizarCamada,
  criarEmoji,
  criarEtiqueta,
  criarTexto,
  documentoVazio,
  mudarModoDoFundo,
  paletaDaLoja,
  posicaoInicialDaCamada,
  produtoDoStory,
  removerCamada,
  temEdicao,
  tintaSobre,
  type DocumentoDoStory,
  type EspessuraId,
  type ModeloDeEtiqueta,
  type ProdutoMarcado,
  type Texto,
} from "./documento.ts";
import { esperarAsFontes, familiasDoEditor } from "./fontes.ts";
import {
  alterarAoVivo,
  criarHistorico,
  desfazer,
  fecharAlteracao,
  podeDesfazer,
  podeRefazer,
  refazer,
  registrar,
  type Historico,
} from "./historico.ts";
import {
  carregarImagem,
  conferirArquivoEscolhido,
  conferirDuracaoDoVideo,
  lerTamanhoDaImagem,
  type MidiaDoStory,
} from "./midia.ts";
import {
  enderecoDoEnvio,
  linkDoStory,
  type DestinoDoBotao,
} from "./publicar.ts";

export interface PerfilDoEditor {
  readonly apelido: string;
  readonly nome: string;
}

interface Props {
  readonly perfil: PerfilDoEditor;
  readonly limites: LimitesDeMidia;
  /** Chamado assim que o story foi publicado (a lista de trás se atualiza). */
  readonly aoPublicado: () => void;
  readonly aoFechar: () => void;
  readonly buscarProdutos?: BuscarProdutos;
}

const FOCAVEIS =
  'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function ehCampoDeTexto(alvo: EventTarget | null): boolean {
  return (
    alvo instanceof HTMLElement &&
    (alvo.tagName === "TEXTAREA" || alvo.tagName === "INPUT" || alvo.isContentEditable)
  );
}

/**
 * O editor de Stories em tela cheia (card #84): câmera ou galeria → edição
 * (desenhar, texto, adesivos, pinça) → publicar. Tudo o que a pessoa fez fica
 * num documento imutável com desfazer; ao publicar, vira uma imagem de
 * 1080 x 1920 (ou um vídeo com as camadas gravadas por cima).
 */
export function EditorDeStory({
  perfil,
  limites,
  aoPublicado,
  aoFechar,
  buscarProdutos,
}: Props) {
  const [fase, setFase] = useState<"captura" | "edicao">("captura");
  const [midia, setMidia] = useState<MidiaDoStory | null>(null);
  const [historico, setHistorico] = useState<Historico<DocumentoDoStory>>(() =>
    criarHistorico(documentoVazio()),
  );
  const [desenhando, setDesenhando] = useState(false);
  const [borracha, setBorracha] = useState(false);
  const [cor, setCor] = useState(BRANCO);
  const [espessura, setEspessura] = useState<EspessuraId>("medio");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [textoEmEdicao, setTextoEmEdicao] = useState<{ id: string | null } | null>(null);
  const [bandejaAberta, setBandejaAberta] = useState(false);
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);
  const [folhaAberta, setFolhaAberta] = useState(false);
  const [envio, setEnvio] = useState<EstadoDoEnvio>({ fase: "pronto" });
  const [legenda, setLegenda] = useState("");
  const [destino, setDestino] = useState<DestinoDoBotao>("loja");
  const [aviso, setAviso] = useState<string | null>(null);
  const [conferindo, setConferindo] = useState(false);

  const raizRef = useRef<HTMLDivElement>(null);
  const urlRef = useRef<string | null>(null);
  const compostoRef = useRef<{ arquivo: Blob; duracao: number | null } | null>(null);
  const destinoTocadoRef = useRef(false);
  const sairDoEnvioRef = useRef<AbortController | null>(null);

  const documento = historico.presente;
  const produto = produtoDoStory(documento);
  const destinoEfetivo: DestinoDoBotao =
    destino === "produto" && produto === null ? "loja" : destino;
  const ocupado = envio.fase === "compondo" || envio.fase === "enviando";

  const destaque = COR_DE_DESTAQUE_PADRAO; // sempre o verde SimpleClick
  const tintaDoDestaque = tintaSobre(destaque);
  const cores = useMemo(() => paletaDaLoja(destaque), [destaque]);
  const familias = useMemo(() => familiasDoEditor(), []);

  // ---- ciclo de vida: foco, rolagem e limpeza -----------------------------

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const rolagem = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    raizRef.current?.focus();
    return () => {
      document.body.style.overflow = rolagem;
      anterior?.focus?.();
      if (urlRef.current !== null) URL.revokeObjectURL?.(urlRef.current);
      sairDoEnvioRef.current?.abort();
    };
  }, []);

  // Mudou algo no documento: o arquivo já montado não vale mais.
  useEffect(() => {
    compostoRef.current = null;
  }, [documento]);

  // ---- histórico ----------------------------------------------------------

  const aoVivo = useCallback((novo: DocumentoDoStory) => {
    setHistorico((h) => alterarAoVivo(h, novo));
  }, []);
  const fecharGesto = useCallback((antes: DocumentoDoStory) => {
    setHistorico((h) => fecharAlteracao(h, antes));
  }, []);
  const registrarDoc = useCallback((novo: DocumentoDoStory) => {
    setHistorico((h) => registrar(h, novo));
  }, []);

  // ---- mídia --------------------------------------------------------------

  function trocarMidia(nova: MidiaDoStory | null) {
    if (urlRef.current !== null) URL.revokeObjectURL?.(urlRef.current);
    urlRef.current = nova?.url ?? null;
    setMidia(nova);
    setHistorico(criarHistorico(documentoVazio()));
    setDesenhando(false);
    setBorracha(false);
    setSelecionado(null);
    setTextoEmEdicao(null);
    setBandejaAberta(false);
    setFolhaAberta(false);
    setEnvio({ fase: "pronto" });
    setLegenda("");
    setDestino("loja");
    destinoTocadoRef.current = false;
    setFase(nova === null ? "captura" : "edicao");
  }

  async function abrirArquivo(arquivo: File) {
    setAviso(null);
    setConferindo(true);
    try {
      const conferencia = conferirArquivoEscolhido(arquivo, limites);
      if (!conferencia.ok) {
        setAviso(conferencia.motivo);
        return;
      }
      const url = URL.createObjectURL(arquivo);
      if (conferencia.tipo === "video") {
        const dados = await lerDadosDoVideo(arquivo);
        const recusa = conferirDuracaoDoVideo(dados, limites);
        if (recusa !== null || dados.largura === null || dados.altura === null) {
          URL.revokeObjectURL(url);
          setAviso(recusa ?? "Não foi possível abrir este vídeo. Use MP4 ou WebM.");
          return;
        }
        trocarMidia({
          tipo: "video",
          url,
          arquivo,
          largura: dados.largura,
          altura: dados.altura,
          duracaoSegundos: dados.duracaoSegundos,
          origem: "galeria",
        });
        return;
      }
      const medida = await lerTamanhoDaImagem(url);
      if (medida === null) {
        URL.revokeObjectURL(url);
        setAviso("Não foi possível abrir esta imagem. Use uma foto JPEG, PNG ou WebP.");
        return;
      }
      trocarMidia({
        tipo: "imagem",
        url,
        arquivo,
        largura: medida.largura,
        altura: medida.altura,
        duracaoSegundos: null,
        origem: "galeria",
      });
    } finally {
      setConferindo(false);
    }
  }

  function aceitarCaptura(captura: CapturaFeita) {
    setAviso(null);
    trocarMidia({
      tipo: captura.tipo,
      url: URL.createObjectURL(captura.arquivo),
      arquivo: captura.arquivo,
      largura: captura.largura,
      altura: captura.altura,
      duracaoSegundos: captura.duracaoSegundos,
      origem: "camera",
    });
  }

  // ---- saída --------------------------------------------------------------

  function pedirSaida() {
    if (ocupado) return;
    if (fase === "captura") {
      aoFechar();
      return;
    }
    if (envio.fase === "sucesso") {
      aoFechar();
      return;
    }
    if (temEdicao(documento)) setConfirmandoSaida(true);
    else trocarMidia(null);
  }

  // ---- camadas ------------------------------------------------------------

  function concluirTexto(parte: ParteDoTexto) {
    const editando = textoEmEdicao;
    setTextoEmEdicao(null);
    if (editando === null) return;
    const vazio = parte.texto.trim() === "";
    if (editando.id !== null) {
      const id = editando.id;
      registrarDoc(
        vazio
          ? removerCamada(documento, id)
          : atualizarCamada(documento, id, (camada) =>
              camada.tipo === "texto" ? { ...camada, ...parte } : camada,
            ),
      );
      if (vazio) setSelecionado(null);
      return;
    }
    if (vazio) return;
    const novo = criarTexto(
      parte,
      posicaoInicialDaCamada((documento.camadas.length % 5) * 70),
    );
    registrarDoc(adicionarCamada(documento, novo));
    setSelecionado(novo.id);
  }

  function adicionarEmoji(emoji: string) {
    const novo = criarEmoji(
      emoji,
      posicaoInicialDaCamada((documento.camadas.length % 5) * 70),
    );
    registrarDoc(adicionarCamada(documento, novo));
    setSelecionado(novo.id);
    setBandejaAberta(false);
  }

  function adicionarEtiqueta(
    modelo: Pick<ModeloDeEtiqueta, "texto" | "fundo" | "tinta">,
    marcado: ProdutoMarcado | null,
  ) {
    const novo = criarEtiqueta(
      modelo,
      posicaoInicialDaCamada((documento.camadas.length % 5) * 70),
      marcado,
    );
    registrarDoc(adicionarCamada(documento, novo));
    setSelecionado(novo.id);
    setBandejaAberta(false);
  }

  function apagarSelecionado() {
    if (selecionado === null) return;
    registrarDoc(removerCamada(documento, selecionado));
    setSelecionado(null);
  }

  const textoAtual: Texto | null = useMemo(() => {
    if (textoEmEdicao?.id == null) return null;
    const camada = documento.camadas.find((c) => c.id === textoEmEdicao.id);
    return camada?.tipo === "texto" ? camada : null;
  }, [documento.camadas, textoEmEdicao]);

  // ---- publicar -----------------------------------------------------------

  function abrirFolha() {
    if (produto !== null && !destinoTocadoRef.current) setDestino("produto");
    setEnvio({ fase: "pronto" });
    setSelecionado(null);
    setFolhaAberta(true);
  }

  /** Foto: monta no canvas. Vídeo: regrava com as camadas, ou sobe o original se nada mudou. */
  async function montarArquivo(
    atual: MidiaDoStory,
    sinal: AbortSignal,
  ): Promise<{ arquivo: Blob; duracao: number | null }> {
    if (atual.tipo === "imagem") {
      await esperarAsFontes();
      const imagem = await carregarImagem(atual.url);
      const tela = comporFoto(
        documento,
        {
          origem: imagem,
          largura: imagem.naturalWidth,
          altura: imagem.naturalHeight,
        },
        familiasDoEditor(),
      );
      return { arquivo: await exportarFoto(tela), duracao: null };
    }
    if (!precisaComporOVideo(documento, atual.largura, atual.altura)) {
      return { arquivo: atual.arquivo, duracao: atual.duracaoSegundos };
    }
    if (!composicaoDeVideoSuportada()) {
      throw new Error(
        "Este navegador não consegue gravar o vídeo com texto, desenho e adesivos. Tire o que foi adicionado, ou use o Chrome ou o Safari atualizados.",
      );
    }
    await esperarAsFontes();
    const composto = await comporVideo({
      documento,
      urlDoVideo: atual.url,
      familias: familiasDoEditor(),
      criarTela: (largura, altura) => {
        const tela = document.createElement("canvas");
        tela.width = largura;
        tela.height = altura;
        return tela;
      },
      aoProgredir: (fracao) => setEnvio({ fase: "compondo", fracao }),
      sinal,
    });
    return { arquivo: composto.arquivo, duracao: composto.duracaoSegundos };
  }

  async function publicar() {
    if (midia === null || ocupado) return;
    const controle = new AbortController();
    sairDoEnvioRef.current = controle;
    try {
      let pronto = compostoRef.current;
      if (pronto === null) {
        setEnvio({ fase: "compondo", fracao: null });
        pronto = await montarArquivo(midia, controle.signal);
        compostoRef.current = pronto;
      }

      setEnvio({ fase: "enviando", fracao: 0 });
      const resposta = await enviarComProgresso(
        enderecoDoEnvio({
          legenda,
          link: linkDoStory(perfil.apelido, destinoEfetivo, produto),
          duracaoSegundos: pronto.duracao,
        }),
        pronto.arquivo,
        (fracao) => setEnvio({ fase: "enviando", fracao }),
      );
      if (resposta.status < 200 || resposta.status >= 300) {
        setEnvio({ fase: "erro", mensagem: explicarRecusaDoEnvio(resposta, limites) });
        return;
      }
      setEnvio({ fase: "sucesso" });
      aoPublicado();
    } catch (erro) {
      if (controle.signal.aborted) return;
      const rede = erro instanceof Error && erro.message === "rede";
      setEnvio({
        fase: "erro",
        mensagem: rede
          ? "A conexão caiu durante o envio. Tente de novo."
          : erro instanceof Error && erro.message !== ""
            ? erro.message
            : "Não foi possível publicar o story. Tente de novo.",
      });
    }
  }

  // ---- teclado ------------------------------------------------------------

  function aoTeclar(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key === "Tab") {
      const raiz = raizRef.current;
      if (raiz === null) return;
      const itens = [...raiz.querySelectorAll<HTMLElement>(FOCAVEIS)].filter(
        (item) => item.offsetParent !== null || item === document.activeElement,
      );
      const primeiro = itens[0];
      const ultimo = itens[itens.length - 1];
      if (primeiro === undefined || ultimo === undefined) {
        evento.preventDefault();
        return;
      }
      if (evento.shiftKey && (document.activeElement === primeiro || document.activeElement === raiz)) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primeiro.focus();
      }
      return;
    }
    if (evento.key === "Escape") {
      evento.preventDefault();
      if (textoEmEdicao !== null) return; // o próprio editor de texto trata
      if (confirmandoSaida) setConfirmandoSaida(false);
      else if (folhaAberta) {
        if (envio.fase === "sucesso") aoFechar();
        else if (!ocupado) setFolhaAberta(false);
      } else if (bandejaAberta) setBandejaAberta(false);
      else if (desenhando) setDesenhando(false);
      else pedirSaida();
      return;
    }
    if (fase !== "edicao" || textoEmEdicao !== null || ehCampoDeTexto(evento.target)) return;
    const comando = evento.metaKey || evento.ctrlKey;
    if (comando && evento.key.toLowerCase() === "z") {
      evento.preventDefault();
      setHistorico((h) => (evento.shiftKey ? refazer(h) : desfazer(h)));
    } else if (comando && evento.key.toLowerCase() === "y") {
      evento.preventDefault();
      setHistorico((h) => refazer(h));
    } else if ((evento.key === "Delete" || evento.key === "Backspace") && selecionado !== null) {
      evento.preventDefault();
      apagarSelecionado();
    }
  }

  const estiloDaRaiz = {
    "--sc-story-destaque": destaque,
    "--sc-story-sobre-destaque": tintaDoDestaque,
  } as CSSProperties;

  const modoDoFundo = documento.fundo.modo;
  const larguraDaEspessura =
    ESPESSURAS_DO_PINCEL.find((opcao) => opcao.id === espessura)?.valor ?? 26;
  const tiposAceitos = "image/*,video/*";

  const conteudo = (
    <div
      ref={raizRef}
      className="sc-story-editor"
      role="dialog"
      aria-modal="true"
      aria-label="Criar story"
      tabIndex={-1}
      style={estiloDaRaiz}
      onKeyDown={aoTeclar}
    >
      {fase === "captura" ? (
        <TelaDeCaptura
          ativa
          tiposAceitos={tiposAceitos}
          ocupada={conferindo}
          aviso={aviso}
          aoEscolherArquivo={(arquivo) => void abrirArquivo(arquivo)}
          aoCapturar={aceitarCaptura}
          aoFechar={aoFechar}
        />
      ) : null}

      {fase === "edicao" && midia !== null ? (
        <div className="sc-story-edicao">
          <header className="sc-story-edicao__topo">
            <button
              type="button"
              className="sc-story-icone"
              aria-label="Cancelar e descartar o story"
              title="Cancelar"
              disabled={ocupado}
              onClick={pedirSaida}
            >
              <IconeFechar aria-hidden="true" />
            </button>
            <div className="sc-story-edicao__ferramentas">
              <button
                type="button"
                className="sc-story-icone"
                aria-label="Desfazer"
                title="Desfazer"
                disabled={!podeDesfazer(historico)}
                onClick={() => setHistorico((h) => desfazer(h))}
              >
                <IconeDesfazer aria-hidden="true" />
              </button>
              <button
                type="button"
                className="sc-story-icone"
                aria-label="Refazer"
                title="Refazer"
                disabled={!podeRefazer(historico)}
                onClick={() => setHistorico((h) => refazer(h))}
              >
                <IconeRefazer aria-hidden="true" />
              </button>
              <button
                type="button"
                className="sc-story-icone"
                aria-label={
                  modoDoFundo === "preencher"
                    ? "Mostrar a foto inteira, sem cortar"
                    : "Preencher a tela com a foto"
                }
                title={modoDoFundo === "preencher" ? "Mostrar inteira" : "Preencher a tela"}
                aria-pressed={modoDoFundo === "ajustar"}
                onClick={() =>
                  registrarDoc(
                    mudarModoDoFundo(
                      documento,
                      modoDoFundo === "preencher" ? "ajustar" : "preencher",
                    ),
                  )
                }
              >
                <IconeEnquadrar aria-hidden="true" />
              </button>
              <button
                type="button"
                className="sc-story-icone"
                aria-label="Desenhar"
                title="Desenhar"
                aria-pressed={desenhando}
                onClick={() => {
                  setDesenhando((valor) => !valor);
                  setBandejaAberta(false);
                  setSelecionado(null);
                }}
              >
                <IconeDesenhar aria-hidden="true" />
              </button>
              <button
                type="button"
                className="sc-story-icone sc-story-icone--texto"
                aria-label="Adicionar texto"
                title="Texto"
                onClick={() => {
                  setDesenhando(false);
                  setBandejaAberta(false);
                  setTextoEmEdicao({ id: null });
                }}
              >
                <IconeTexto aria-hidden="true" />
              </button>
              <button
                type="button"
                className="sc-story-icone"
                aria-label="Adicionar adesivo"
                title="Adesivos"
                aria-pressed={bandejaAberta}
                onClick={() => {
                  setDesenhando(false);
                  setBandejaAberta((valor) => !valor);
                }}
              >
                <IconeAdesivo aria-hidden="true" />
              </button>
            </div>
          </header>

          <div className="sc-story-area">
            <PalcoDoStory
              documento={documento}
              midia={midia}
              familias={familias}
              ferramenta={desenhando ? (borracha ? "borracha" : "desenho") : "mover"}
              cor={cor}
              espessura={larguraDaEspessura}
              selecionado={selecionado}
              aoSelecionar={setSelecionado}
              aoVivo={aoVivo}
              aoFechar={fecharGesto}
              aoRegistrar={registrarDoc}
              aoEditarTexto={(id) => setTextoEmEdicao({ id })}
            />
          </div>

          <footer className="sc-story-edicao__base">
            {desenhando ? (
              <FerramentasDeDesenho
                cores={cores}
                cor={cor}
                espessura={espessura}
                borracha={borracha}
                aoMudarCor={(nova) => {
                  setCor(nova);
                  setBorracha(false);
                }}
                aoMudarEspessura={setEspessura}
                aoAlternarBorracha={() => setBorracha((valor) => !valor)}
                aoConcluir={() => setDesenhando(false)}
              />
            ) : (
              <>
                <p className="sc-story-dica sc-story-dica--toque">
                  Dois dedos ampliam e giram · arraste até a lixeira para apagar
                </p>
                <p className="sc-story-dica sc-story-dica--mouse">
                  Arraste · roda do mouse amplia · Shift + roda gira · Delete apaga
                </p>
                <button
                  type="button"
                  className="sc-story-publicar"
                  disabled={ocupado}
                  onClick={abrirFolha}
                >
                  Publicar Story
                </button>
              </>
            )}
          </footer>

          {bandejaAberta ? (
            <BandejaDeAdesivos
              corDestaque={destaque}
              tintaDaDestaque={tintaDoDestaque}
              {...(buscarProdutos === undefined ? {} : { buscarProdutos })}
              aoEscolherEmoji={adicionarEmoji}
              aoEscolherEtiqueta={adicionarEtiqueta}
              aoFechar={() => setBandejaAberta(false)}
            />
          ) : null}

          {folhaAberta ? (
            <div className="sc-story-cortina">
              <FolhaDePublicar
                estado={envio}
                tipo={midia.tipo}
                nomeDaLoja={perfil.nome}
                legenda={legenda}
                destino={destinoEfetivo}
                produto={produto}
                aoMudarLegenda={setLegenda}
                aoMudarDestino={(novo) => {
                  destinoTocadoRef.current = true;
                  setDestino(novo);
                }}
                aoPublicar={() => void publicar()}
                aoVoltar={() => setFolhaAberta(false)}
                aoConcluir={aoFechar}
              />
            </div>
          ) : null}

          {textoEmEdicao !== null ? (
            <EditorDeTexto
              inicial={textoAtual}
              cores={cores}
              familias={familias}
              aoConcluir={concluirTexto}
            />
          ) : null}

          {confirmandoSaida ? (
            <div className="sc-story-cortina sc-story-cortina--centro">
              <div
                className="sc-story-confirma"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="sc-story-confirma-titulo"
                aria-describedby="sc-story-confirma-texto"
              >
                <p id="sc-story-confirma-titulo" className="sc-story-folha__titulo">
                  Descartar este story?
                </p>
                <p id="sc-story-confirma-texto">
                  Você perde o desenho, os textos e os adesivos que acabou de fazer.
                </p>
                <div className="sc-story-folha__acoes">
                  <button
                    type="button"
                    className="sc-story-botao sc-story-botao--destaque"
                    autoFocus
                    onClick={() => setConfirmandoSaida(false)}
                  >
                    Continuar editando
                  </button>
                  <button
                    type="button"
                    className="sc-story-botao sc-story-botao--perigo"
                    onClick={() => {
                      setConfirmandoSaida(false);
                      trocarMidia(null);
                    }}
                  >
                    Descartar
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(conteudo, document.body);
}
