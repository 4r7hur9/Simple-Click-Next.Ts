"use client";

import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { IconeBuscar, IconeConfirmar, IconeSeta } from "./icones";

/**
 * Seletor: o `<select>` do SimpleClick.
 *
 * O `<select>` nativo abre a lista do sistema — no macOS, com o destaque azul
 * dele e fundo fora da paleta, e nenhum CSS alcança essa lista. Este desenha a
 * lista por conta própria, no padrão "combobox só de escolha" do APG: o foco
 * fica no botão, a opção ativa é anunciada por `aria-activedescendant`, e o
 * teclado faz o que se espera de um select (setas, Home/End, PageUp/PageDown,
 * Enter, Esc, Tab e digitar o começo do nome para pular até ele).
 *
 * Troca direta de um `<select>`: aceita os mesmos `<option>` e `<optgroup>`
 * como filhos (ou a lista em `opcoes`), `value`/`defaultValue`, `name`,
 * `required`, `disabled` e os `aria-*` de sempre. A diferença é o `onChange`,
 * que recebe o VALOR, e não o evento. Com `name`, um campo escondido leva o
 * valor no envio do `<form>` (inclusive Server Actions).
 *
 * O painel é `popover` manual quando o navegador tem: assim ele desenha por
 * cima de tudo, inclusive de um `<dialog>` e de caixa com `overflow: hidden`.
 * Quem fecha somos nós (clique fora, Esc, escolha), para o foco voltar certo.
 */

export type OpcaoDoSeletor = {
  valor: string;
  rotulo: string;
  desabilitado?: boolean | undefined;
  /** Nome do grupo: opções seguidas com o mesmo grupo aparecem juntas. */
  grupo?: string | undefined;
};

export type SeletorProps = {
  /** Vai no botão: é o que o `<label htmlFor>` aponta. */
  id?: string | undefined;
  /** Com `name`, o valor entra no envio do formulário. */
  name?: string | undefined;
  /** Liga o campo a um `<form id>` de fora, como no `<select form>`. */
  form?: string | undefined;
  value?: string | number | undefined;
  defaultValue?: string | number | undefined;
  /** Recebe o valor escolhido; só é chamado quando ele muda. */
  onChange?: ((valor: string) => void) | undefined;
  /** Lista das opções. Sem ela, valem os `<option>` passados como filhos. */
  opcoes?: readonly OpcaoDoSeletor[] | undefined;
  children?: ReactNode;
  /** Texto do botão quando o valor não bate com opção nenhuma. */
  placeholder?: string | undefined;
  /**
   * Campo de busca no topo da lista. Sem dizer, liga sozinho a partir de
   * {@link OPCOES_PARA_BUSCA} opções (UF, cidades, tipos de negócio).
   */
  busca?: boolean | undefined;
  rotuloDaBusca?: string | undefined;
  disabled?: boolean | undefined;
  required?: boolean | undefined;
  /** Classes do botão (o controle visível), como no `<select className>`. */
  className?: string | undefined;
  /** Classes do envelope, para posicionar o conjunto na grade. */
  classeDaRaiz?: string | undefined;
  title?: string | undefined;
  "aria-label"?: string | undefined;
  "aria-labelledby"?: string | undefined;
  "aria-describedby"?: string | undefined;
  "aria-invalid"?: boolean | "true" | "false" | undefined;
};

/** A partir de quantas opções a lista ganha busca sem pedir. */
export const OPCOES_PARA_BUSCA = 12;
/** Distância mínima entre o painel e a borda da tela, em pixels. */
const MARGEM_DA_TELA = 8;
/** Espaço entre o botão e o painel, em pixels. */
const VAO = 4;
/** Altura máxima da lista: cerca de oito opções de 44px. */
const ALTURA_MAXIMA = 360;
/** Menos que isto embaixo, e com mais espaço em cima, o painel abre para cima. */
const ALTURA_MINIMA = 180;
/** Pausa que encerra a palavra digitada para pular até a opção. */
const PAUSA_DA_DIGITACAO = 600;
/** Quanto o PageUp/PageDown pula. */
const SALTO_DE_PAGINA = 8;

/** Texto plano de um nó do React: o que a opção mostra. */
function textoDe(no: ReactNode): string {
  return Children.toArray(no)
    .map((filho) => {
      if (typeof filho === "string" || typeof filho === "number") {
        return String(filho);
      }
      if (isValidElement<{ children?: ReactNode }>(filho)) {
        return textoDe(filho.props.children);
      }
      return "";
    })
    .join("");
}

type PropsDeOption = {
  value?: string | number | readonly string[];
  disabled?: boolean;
  children?: ReactNode;
  label?: string;
};

/** Lê `<option>` e `<optgroup>` (soltos, em lista ou em fragmento). */
function lerOpcoes(filhos: ReactNode, grupo?: string): OpcaoDoSeletor[] {
  const opcoes: OpcaoDoSeletor[] = [];
  for (const filho of Children.toArray(filhos)) {
    if (!isValidElement<PropsDeOption>(filho)) continue;
    const props = filho.props;
    if (filho.type === Fragment) {
      opcoes.push(...lerOpcoes(props.children, grupo));
    } else if (filho.type === "optgroup") {
      opcoes.push(...lerOpcoes(props.children, props.label));
    } else if (filho.type === "option") {
      const rotulo = textoDe(props.children);
      opcoes.push({
        valor: props.value === undefined ? rotulo : String(props.value),
        rotulo,
        desabilitado: props.disabled === true,
        grupo,
      });
    }
  }
  return opcoes;
}

/** Minúsculas e sem acento: "São Paulo" acha com "sao". */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function emTexto(valor: string | number | undefined): string | undefined {
  return valor === undefined ? undefined : String(valor);
}

/** Listbox próprio, na paleta do SimpleClick, no lugar do `<select>`. */
export function Seletor({
  id,
  name,
  form,
  value,
  defaultValue,
  onChange,
  opcoes: opcoesDadas,
  children,
  placeholder,
  busca,
  rotuloDaBusca = "Buscar na lista",
  disabled = false,
  required = false,
  className,
  classeDaRaiz,
  title,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  "aria-describedby": ariaDescribedby,
  "aria-invalid": ariaInvalid,
}: SeletorProps) {
  const base = useId();
  const idDoBotao = id ?? `${base}-botao`;
  const idDaLista = `${base}-lista`;
  const idDaOpcao = (indice: number) => `${base}-opcao-${indice}`;

  const opcoes = useMemo(
    () => opcoesDadas ?? lerOpcoes(children),
    [opcoesDadas, children],
  );

  // Sem `value` nem `defaultValue`, vale a primeira opção, como no nativo.
  const inicial =
    emTexto(defaultValue) ??
    opcoes.find((opcao) => opcao.desabilitado !== true)?.valor ??
    "";
  const valorInicial = useRef(inicial);
  const [interno, setInterno] = useState(inicial);
  const controlado = value !== undefined;
  const atual = controlado ? String(value) : interno;
  const escolhida = opcoes.find((opcao) => opcao.valor === atual);

  const [aberto, setAberto] = useState(false);
  const [ativa, setAtiva] = useState(-1);
  const [termo, setTermo] = useState("");
  const [nomeDaLista, setNomeDaLista] = useState<string | undefined>();

  const raiz = useRef<HTMLDivElement>(null);
  const gatilho = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  const campoDeBusca = useRef<HTMLInputElement>(null);
  const digitado = useRef({ texto: "", ate: 0 });

  const comBusca = busca ?? opcoes.length >= OPCOES_PARA_BUSCA;

  // Índices (na lista completa) das opções que a busca deixa ver.
  const visiveis = useMemo(() => {
    const procura = normalizar(termo);
    const todas = opcoes.map((_, indice) => indice);
    if (procura === "") return todas;
    return todas.filter((indice) => {
      const opcao = opcoes[indice]!;
      return (
        normalizar(opcao.rotulo).includes(procura) ||
        normalizar(opcao.valor).includes(procura)
      );
    });
  }, [opcoes, termo]);

  const habilitada = useCallback(
    (indice: number) => opcoes[indice]?.desabilitado !== true,
    [opcoes],
  );

  /** Próxima opção habilitada a partir de uma posição em `visiveis`. */
  function vizinha(posicao: number, passo: 1 | -1): number {
    for (
      let cada = posicao + passo;
      cada >= 0 && cada < visiveis.length;
      cada += passo
    ) {
      if (habilitada(visiveis[cada]!)) return visiveis[cada]!;
    }
    return ativa;
  }

  function primeira(): number {
    return visiveis.find(habilitada) ?? -1;
  }

  function ultima(): number {
    return [...visiveis].reverse().find(habilitada) ?? -1;
  }

  function abrir(destaque?: number) {
    if (disabled) return;
    const indiceAtual = opcoes.findIndex((opcao) => opcao.valor === atual);
    setTermo("");
    setAtiva(
      destaque ??
        (indiceAtual >= 0 && habilitada(indiceAtual)
          ? indiceAtual
          : opcoes.findIndex((opcao) => opcao.desabilitado !== true)),
    );
    const rotulo = gatilho.current?.labels?.[0]?.textContent?.trim();
    setNomeDaLista(rotulo === "" ? undefined : rotulo);
    setAberto(true);
  }

  function fechar(devolverFoco = true) {
    setAberto(false);
    setTermo("");
    if (devolverFoco) gatilho.current?.focus();
  }

  function escolher(indice: number) {
    const opcao = opcoes[indice];
    if (opcao === undefined || opcao.desabilitado === true) return;
    if (!controlado) setInterno(opcao.valor);
    if (opcao.valor !== atual) onChange?.(opcao.valor);
    fechar();
  }

  /** Pula até a opção que começa com o que foi digitado em sequência. */
  function pularPara(letra: string) {
    const agora = Date.now();
    const anterior = agora < digitado.current.ate ? digitado.current.texto : "";
    const texto = anterior + normalizar(letra);
    digitado.current = { texto, ate: agora + PAUSA_DA_DIGITACAO };

    // A mesma letra repetida passa de uma opção para a seguinte que começa
    // com ela, como no select nativo.
    const repetida = [...texto].every((caractere) => caractere === texto[0]);
    const procura = repetida ? texto[0]! : texto;
    const inicio = Math.max(
      aberto ? ativa : opcoes.findIndex((opcao) => opcao.valor === atual),
      0,
    );
    const ordem = [
      ...visiveis.filter((indice) => indice > inicio),
      ...visiveis.filter((indice) => indice <= inicio),
    ];
    const comecaDoAtual = !repetida || texto.length > 1 ? [inicio] : [];
    const achada = [...comecaDoAtual, ...ordem].find(
      (indice) =>
        habilitada(indice) &&
        normalizar(opcoes[indice]?.rotulo ?? "").startsWith(procura),
    );
    if (achada === undefined) return;
    if (aberto) setAtiva(achada);
    else abrir(achada);
  }

  function aoTeclar(evento: KeyboardEvent, naBusca: boolean) {
    const tecla = evento.key;
    const posicao = visiveis.indexOf(ativa);

    if (!aberto) {
      if (
        tecla === "ArrowDown" ||
        tecla === "ArrowUp" ||
        tecla === "Enter" ||
        tecla === " "
      ) {
        evento.preventDefault();
        abrir();
      } else if (tecla === "Home" || tecla === "End") {
        evento.preventDefault();
        abrir(tecla === "Home" ? primeira() : ultima());
      } else if (tecla.length === 1 && !evento.ctrlKey && !evento.metaKey) {
        pularPara(tecla);
      }
      return;
    }

    switch (tecla) {
      case "ArrowDown":
        evento.preventDefault();
        setAtiva(posicao < 0 ? primeira() : vizinha(posicao, 1));
        return;
      case "ArrowUp":
        evento.preventDefault();
        if (evento.altKey) {
          escolher(ativa);
          return;
        }
        setAtiva(posicao < 0 ? ultima() : vizinha(posicao, -1));
        return;
      case "PageDown":
      case "PageUp": {
        evento.preventDefault();
        const passo = tecla === "PageDown" ? 1 : -1;
        let destino = ativa;
        let cada = posicao;
        for (let vez = 0; vez < SALTO_DE_PAGINA; vez += 1) {
          const proxima = vizinha(cada, passo);
          if (proxima === destino) break;
          destino = proxima;
          cada = visiveis.indexOf(proxima);
        }
        setAtiva(destino);
        return;
      }
      case "Home":
      case "End":
        // Na busca, Home/End andam no texto, como em todo campo.
        if (naBusca) return;
        evento.preventDefault();
        setAtiva(tecla === "Home" ? primeira() : ultima());
        return;
      case "Enter":
        evento.preventDefault();
        escolher(ativa);
        return;
      case "Escape":
        // Não deixa o Esc chegar ao `<dialog>` em volta: fecha só a lista.
        evento.preventDefault();
        evento.stopPropagation();
        fechar();
        return;
      case "Tab":
        if (ativa >= 0 && opcoes[ativa]?.valor !== atual) escolher(ativa);
        fechar(false);
        return;
      case " ":
        if (naBusca) return;
        evento.preventDefault();
        if (Date.now() < digitado.current.ate) pularPara(" ");
        else escolher(ativa);
        return;
      default:
        if (
          !naBusca &&
          tecla.length === 1 &&
          !evento.ctrlKey &&
          !evento.metaKey
        ) {
          pularPara(tecla);
        }
    }
  }

  // Posiciona o painel junto do botão: embaixo, ou em cima quando falta espaço.
  const posicionar = useCallback(() => {
    const botao = gatilho.current;
    const caixa = painel.current;
    if (botao === null || caixa === null) return;

    const ancora = botao.getBoundingClientRect();
    const larguraDaTela = window.innerWidth;
    const alturaDaTela = window.innerHeight;
    const largura = Math.min(
      Math.max(ancora.width, 200),
      larguraDaTela - MARGEM_DA_TELA * 2,
    );
    const esquerda = Math.max(
      MARGEM_DA_TELA,
      Math.min(ancora.left, larguraDaTela - largura - MARGEM_DA_TELA),
    );

    const embaixo = alturaDaTela - ancora.bottom - VAO - MARGEM_DA_TELA;
    const emCima = ancora.top - VAO - MARGEM_DA_TELA;
    const paraCima = embaixo < ALTURA_MINIMA && emCima > embaixo;
    const altura = Math.min(ALTURA_MAXIMA, paraCima ? emCima : embaixo);

    caixa.style.left = `${esquerda}px`;
    caixa.style.width = `${largura}px`;
    caixa.style.maxHeight = `${Math.max(altura, 120)}px`;
    if (paraCima) {
      caixa.style.top = "auto";
      caixa.style.bottom = `${alturaDaTela - ancora.top + VAO}px`;
    } else {
      caixa.style.bottom = "auto";
      caixa.style.top = `${ancora.bottom + VAO}px`;
    }
    caixa.dataset["lado"] = paraCima ? "cima" : "baixo";
  }, []);

  // Abre e fecha o popover junto com o estado, e segue o botão na rolagem.
  useLayoutEffect(() => {
    const caixa = painel.current;
    if (caixa === null) return;
    const temPopover = typeof caixa.showPopover === "function";
    if (!aberto) {
      if (temPopover && caixa.matches(":popover-open")) caixa.hidePopover();
      return;
    }
    if (temPopover && !caixa.matches(":popover-open")) caixa.showPopover();
    posicionar();
    window.addEventListener("resize", posicionar);
    window.addEventListener("scroll", posicionar, true);
    return () => {
      window.removeEventListener("resize", posicionar);
      window.removeEventListener("scroll", posicionar, true);
    };
  }, [aberto, posicionar]);

  // Com busca, o foco vai para ela — menos no toque, onde abrir o teclado
  // por cima da lista atrapalha mais do que ajuda.
  useEffect(() => {
    if (!aberto || !comBusca) return;
    const toque =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    if (!toque) campoDeBusca.current?.focus();
  }, [aberto, comBusca]);

  // Clique fora fecha, sem roubar o foco de onde a pessoa clicou.
  useEffect(() => {
    if (!aberto) return;
    function aoTocarFora(evento: PointerEvent) {
      if (!raiz.current?.contains(evento.target as Node)) fechar(false);
    }
    document.addEventListener("pointerdown", aoTocarFora, true);
    return () => document.removeEventListener("pointerdown", aoTocarFora, true);
  });

  // A opção ativa sempre à vista dentro da lista.
  useEffect(() => {
    if (!aberto || ativa < 0) return;
    document.getElementById(idDaOpcao(ativa))?.scrollIntoView?.({
      block: "nearest",
    });
    // `idDaOpcao` só depende de `base`, que não muda.
  }, [aberto, ativa]);

  // Sem `value`, o reset do formulário volta ao valor do começo.
  useEffect(() => {
    if (controlado) return;
    const formulario = gatilho.current?.form;
    if (formulario === null || formulario === undefined) return;
    const voltar = () => setInterno(valorInicial.current);
    formulario.addEventListener("reset", voltar);
    return () => formulario.removeEventListener("reset", voltar);
  }, [controlado]);

  const vazio = atual === "" || escolhida === undefined;
  const textoDoBotao = escolhida?.rotulo ?? placeholder ?? "";
  const idAtiva = aberto && ativa >= 0 ? idDaOpcao(ativa) : undefined;

  // Agrupa as visíveis em blocos seguidos do mesmo grupo.
  const blocos: { grupo: string | undefined; indices: number[] }[] = [];
  for (const indice of visiveis) {
    const grupo = opcoes[indice]?.grupo;
    const ultimo = blocos.at(-1);
    if (ultimo !== undefined && ultimo.grupo === grupo) {
      ultimo.indices.push(indice);
    } else {
      blocos.push({ grupo, indices: [indice] });
    }
  }

  function desenharOpcao(indice: number) {
    const opcao = opcoes[indice]!;
    const selecionada = opcao.valor === atual;
    return (
      <li
        key={`${indice}-${opcao.valor}`}
        id={idDaOpcao(indice)}
        role="option"
        className="sc-seletor__opcao"
        aria-selected={selecionada}
        aria-disabled={opcao.desabilitado === true || undefined}
        data-valor={opcao.valor}
        data-ativa={indice === ativa || undefined}
        onPointerMove={() => {
          if (opcao.desabilitado !== true && indice !== ativa) setAtiva(indice);
        }}
        onClick={(evento) => {
          // Dentro de um `<label>`, o clique voltaria ao botão e reabriria.
          evento.preventDefault();
          escolher(indice);
        }}
      >
        <span className="sc-seletor__rotulo">{opcao.rotulo}</span>
        {selecionada && (
          <IconeConfirmar className="sc-seletor__check" aria-hidden="true" />
        )}
      </li>
    );
  }

  const invalido = ariaInvalid === true || ariaInvalid === "true";

  return (
    <div
      ref={raiz}
      className={["sc-seletor", classeDaRaiz].filter(Boolean).join(" ")}
    >
      <button
        ref={gatilho}
        type="button"
        id={idDoBotao}
        role="combobox"
        value={atual}
        title={title}
        className={["sc-campo__controle", "sc-seletor__gatilho", className]
          .filter(Boolean)
          .join(" ")}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={idDaLista}
        aria-activedescendant={idAtiva}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        aria-describedby={ariaDescribedby}
        aria-invalid={invalido || undefined}
        aria-required={required || undefined}
        onClick={() => (aberto ? fechar() : abrir())}
        onKeyDown={(evento) => aoTeclar(evento, false)}
        onKeyUp={(evento) => {
          // O espaço já abriu (ou escolheu) no keydown: sem isto, o clique
          // que o navegador dispara ao soltar a tecla fecharia a lista.
          if (evento.key === " ") evento.preventDefault();
        }}
      >
        <span
          className={["sc-seletor__valor", vazio && "sc-seletor__valor--vazio"]
            .filter(Boolean)
            .join(" ")}
        >
          {textoDoBotao}
        </span>
        <IconeSeta className="sc-seletor__seta" aria-hidden="true" />
      </button>

      {required ? (
        // Campo de verdade (e não `hidden`) para o navegador recusar o envio
        // vazio; o foco que ele mandaria para cá vai para o botão.
        <input
          className="sc-seletor__nativo"
          tabIndex={-1}
          aria-hidden="true"
          name={name}
          form={form}
          value={atual}
          required
          disabled={disabled}
          onChange={() => undefined}
          onFocus={() => gatilho.current?.focus()}
        />
      ) : name !== undefined ? (
        <input
          type="hidden"
          name={name}
          form={form}
          value={atual}
          disabled={disabled}
        />
      ) : null}

      <div
        ref={painel}
        className="sc-seletor__painel"
        popover="manual"
        hidden={!aberto}
        onMouseDown={(evento) => {
          // O foco fica onde está (botão ou busca) ao clicar na lista.
          if (evento.target !== campoDeBusca.current) evento.preventDefault();
        }}
        onClick={(evento) => {
          if (evento.target !== campoDeBusca.current) evento.preventDefault();
        }}
      >
        {comBusca && (
          <div className="sc-seletor__busca">
            <IconeBuscar className="sc-seletor__lupa" aria-hidden="true" />
            <input
              ref={campoDeBusca}
              type="text"
              inputMode="search"
              enterKeyHint="go"
              autoComplete="off"
              spellCheck={false}
              aria-label={rotuloDaBusca}
              aria-controls={idDaLista}
              aria-activedescendant={idAtiva}
              placeholder="Buscar…"
              value={termo}
              onChange={(evento) => {
                const novo = evento.target.value;
                setTermo(novo);
                const procura = normalizar(novo);
                const primeiraAchada = opcoes.findIndex(
                  (opcao) =>
                    opcao.desabilitado !== true &&
                    (normalizar(opcao.rotulo).includes(procura) ||
                      normalizar(opcao.valor).includes(procura)),
                );
                setAtiva(primeiraAchada);
              }}
              onKeyDown={(evento) => aoTeclar(evento, true)}
            />
          </div>
        )}

        <ul
          id={idDaLista}
          role="listbox"
          className="sc-seletor__lista"
          aria-label={ariaLabel ?? (ariaLabelledby ? undefined : nomeDaLista)}
          aria-labelledby={ariaLabelledby}
        >
          {/* Fechada, a lista fica vazia: a tela não carrega dezenas de
              opções escondidas (nem as soma a quem conta itens da página). */}
          {aberto &&
            blocos.map((bloco, posicao) =>
              bloco.grupo === undefined ? (
                <Fragment key={`solto-${posicao}`}>
                  {bloco.indices.map(desenharOpcao)}
                </Fragment>
              ) : (
                <li
                  key={`grupo-${posicao}`}
                  role="presentation"
                  className="sc-seletor__grupo"
                >
                  <span
                    className="sc-seletor__titulo-do-grupo"
                    aria-hidden="true"
                  >
                    {bloco.grupo}
                  </span>
                  <ul role="group" aria-label={bloco.grupo}>
                    {bloco.indices.map(desenharOpcao)}
                  </ul>
                </li>
              ),
            )}
        </ul>

        {aberto && visiveis.length === 0 && (
          <p className="sc-seletor__nada" role="status">
            Nada encontrado para “{termo}”.
          </p>
        )}
      </div>
    </div>
  );
}
