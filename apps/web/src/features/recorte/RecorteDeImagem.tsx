"use client";
/**
 * O elo entre um campo de envio e o recortador (card #82).
 *
 * Todo ponto de envio de imagem do painel faz o mesmo: a pessoa escolhe um ou
 * mais arquivos, cada um passa pela janela de recorte (na ordem, "Foto 2 de
 * 4") e o arquivo recortado — já WebP, já nas dimensões do espaço — segue para
 * o envio que a tela já tinha. Este gancho guarda a fila e devolve a janela
 * pronta para a tela pôr no JSX; a tela só diz o que fazer com cada arquivo.
 */
import {
  RecortadorDeImagem,
  TIPOS_DE_FOTO_PARA_RECORTAR,
  validarArquivoDeImagem,
  type AjusteDoRecorte,
  type EspacoDoRecorte,
  type ResultadoDoRecorte,
} from "@simpleclick/ui";
import {
  useCallback,
  useState,
  type DragEvent as EventoDeArraste,
  type ReactNode,
} from "react";

import {
  espacoDeImagem,
  textoRecomendado,
  type IdDoEspacoDeImagem,
} from "../../lib/espacos-de-imagem.ts";

/** O `accept` do `<input type="file">`: o que o recortador sabe abrir. */
export const FORMATOS_DO_INPUT_DE_FOTO = TIPOS_DE_FOTO_PARA_RECORTAR.join(",");

export interface OpcoesDoRecorte {
  readonly espaco: IdDoEspacoDeImagem;
  /**
   * O espaço como a janela o desenha, quando a tela acrescenta algo à tabela
   * (a sobreposição "como vai aparecer" do lugar real da foto). Sem ele vale a
   * tabela de `espacos-de-imagem.ts`.
   */
  readonly espacoDaJanela?: EspacoDoRecorte | undefined;
  /** Reabre a janela já enquadrada (a foto escolhida é o original guardado). */
  readonly ajusteInicial?: AjusteDoRecorte | undefined;
  /** A janela entrega também o original, para a tela guardar o ajuste. */
  readonly guardarOriginal?: boolean | undefined;
  /** A pessoa cancelou a janela (nada foi enviado). */
  readonly aoCancelar?: (() => void) | undefined;
  /**
   * Recebe o arquivo recortado e o que a pessoa escolheu. Pode devolver (ou
   * prometer) uma frase de erro: a janela continua aberta e mostra a frase.
   * `resultado` traz também um arquivo por aba (computador e celular) nos
   * espaços que têm uma foto para cada tela.
   */
  readonly aoRecortar: (
    recortado: File,
    original: File,
    resultado: ResultadoDoRecorte,
  ) => void | string | Promise<void | string>;
  /** Chamado com a frase da recusa (arquivo que não serve), ou `null` ao começar de novo. */
  readonly aoRecusar?: ((mensagem: string | null) => void) | undefined;
  /**
   * Depois de cada foto a fila espera `retomar()` antes de abrir a próxima:
   * para telas em que a pessoa ainda confere a foto (descrição, capa) antes
   * de enviar.
   */
  readonly pausarDepoisDeCadaFoto?: boolean | undefined;
}

export interface RecorteDeImagem {
  /** Liga ao `onChange` do input ou ao soltar de arquivos. */
  readonly escolher: (
    arquivos: FileList | readonly File[] | null | undefined,
  ) => void;
  /** A janela de recorte: ponha uma vez no JSX da tela. */
  readonly janela: ReactNode;
  /** Abre a próxima foto da fila (com `pausarDepoisDeCadaFoto`). */
  readonly retomar: () => void;
  /** Descarta o que ainda não foi recortado. */
  readonly cancelarFila: () => void;
  readonly emAndamento: boolean;
  /**
   * Para o arquivo ARRASTADO da área de trabalho até o campo: espalhe no
   * elemento que recebe a foto (`<fieldset {...soltar}>`).
   */
  readonly soltar: {
    readonly onDragOver: (evento: EventoDeArraste<HTMLElement>) => void;
    readonly onDrop: (evento: EventoDeArraste<HTMLElement>) => void;
  };
}

export function useRecorteDeImagem({
  espaco: idDoEspaco,
  espacoDaJanela,
  ajusteInicial,
  guardarOriginal = false,
  aoCancelar,
  aoRecortar,
  aoRecusar,
  pausarDepoisDeCadaFoto = false,
}: OpcoesDoRecorte): RecorteDeImagem {
  const espaco = espacoDeImagem(idDoEspaco);
  const [fila, setFila] = useState<readonly File[]>([]);
  const [total, setTotal] = useState(0);
  const [pausada, setPausada] = useState(false);

  const escolher = useCallback(
    (arquivos: FileList | readonly File[] | null | undefined) => {
      const lista =
        arquivos === null || arquivos === undefined ? [] : Array.from(arquivos);
      if (lista.length === 0) return;
      const aceitos: File[] = [];
      let recusa: string | null = null;
      for (const arquivo of lista) {
        const motivo = validarArquivoDeImagem(arquivo);
        if (motivo === null) aceitos.push(arquivo);
        else if (recusa === null) {
          recusa = lista.length > 1 ? `${arquivo.name}: ${motivo}` : motivo;
        }
      }
      aoRecusar?.(recusa);
      setFila(aceitos);
      setTotal(aceitos.length);
      setPausada(false);
    },
    [aoRecusar],
  );

  const cancelarFila = useCallback(() => {
    setFila([]);
    setTotal(0);
    setPausada(false);
  }, []);

  const atual = pausada ? null : (fila[0] ?? null);

  const janela = (
    <RecortadorDeImagem
      arquivo={atual}
      espaco={espacoDaJanela ?? espaco}
      ajusteInicial={ajusteInicial}
      guardarOriginal={guardarOriginal}
      posicaoNaFila={
        total > 1 ? { atual: total - fila.length + 1, total } : undefined
      }
      limiteDaSaidaEmBytes={espaco.limiteDoArquivoEmBytes}
      aoConfirmar={async (resultado) => {
        if (atual === null) return;
        const erro = await aoRecortar(resultado.arquivo, atual, resultado);
        if (typeof erro === "string") return erro;
        setFila((restante) => restante.slice(1));
        if (pausarDepoisDeCadaFoto) setPausada(true);
        return undefined;
      }}
      aoCancelar={() => {
        cancelarFila();
        aoCancelar?.();
      }}
    />
  );

  const soltar = {
    onDragOver: (evento: EventoDeArraste<HTMLElement>) => {
      if (evento.dataTransfer.types.includes("Files")) evento.preventDefault();
    },
    onDrop: (evento: EventoDeArraste<HTMLElement>) => {
      if (evento.dataTransfer.files.length === 0) return;
      evento.preventDefault();
      escolher(evento.dataTransfer.files);
    },
  };

  return {
    escolher,
    soltar,
    janela,
    retomar: () => setPausada(false),
    cancelarFila,
    emAndamento: fila.length > 0,
  };
}

/**
 * "Recomendado: 1600 × 400 px, JPG/PNG/WebP até 3 MB." ao lado do campo de
 * envio, com a frase de como o recorte ajuda.
 */
export function DicaDoEspaco({
  espaco,
  className,
}: {
  readonly espaco: IdDoEspacoDeImagem;
  readonly className?: string | undefined;
}) {
  return (
    <p
      className={className ?? "text-sm text-[var(--cor-tinta-suave)]"}
      data-recomendado={espaco}
    >
      {textoRecomendado(espaco)} Ao escolher a foto, você enquadra do jeito que
      vai aparecer.
    </p>
  );
}
