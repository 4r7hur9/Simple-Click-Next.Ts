"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { IconeAvancar, IconeCalendario, IconeFechar, IconeVoltar } from "./icones";
import {
  ATALHOS,
  DIAS_DA_SEMANA,
  FUSO_PADRAO,
  compararDatas,
  dataBloqueada,
  descreverDiaPorExtenso,
  descreverIntervalo,
  descreverPeriodo,
  diaDaSemana,
  hojeNoFuso,
  limitarData,
  nomeDoMes,
  ordenarPeriodo,
  periodoAnterior,
  periodoDoAtalho,
  semanasDoMes,
  somarDias,
  somarMeses,
  primeiroDoMes,
  type PeriodoIso,
} from "./periodo";

/**
 * Seletor de período dos dashboards.
 *
 * Um botão mostra o período atual ("Hoje", "Últimos 7 dias", "12 a 18 out
 * 2026"); ao clicar abre uma janela com atalhos e um calendário de intervalo
 * (1 mês, 2 em tela larga). Em tela estreita a janela vira gaveta de baixo.
 *
 * - Datas são texto `yyyy-mm-dd` (dia civil). O "hoje" é do fuso `fuso`
 *   (padrão `America/Fortaleza`), nunca do relógio do computador.
 * - Escolher não aplica: o valor só sobe por `onChange` em **Aplicar**.
 * - Teclado: setas movem o dia; Home/End, início e fim da semana; PageUp/Down
 *   trocam de mês (com Shift, de ano); Enter/Espaço escolhem; Esc cancela.
 * - O foco fica preso na janela e volta ao botão ao fechar.
 */

export type { PeriodoIso } from "./periodo";

export type SeletorDePeriodoProps = {
  /** Período atual, em ISO. */
  value: PeriodoIso;
  /**
   * Chamado em Aplicar. `comparacao` é o período anterior de mesmo tamanho
   * quando o usuário marcou "comparar", ou `null`.
   */
  onChange: (valor: PeriodoIso, comparacao: PeriodoIso | null) => void;
  /** Menor data escolhível (ISO). */
  min?: string | undefined;
  /** Maior data escolhível (ISO). */
  max?: string | undefined;
  fuso?: string | undefined;
  /** Mostra a opção "Comparar com o período anterior". */
  permitirComparacao?: boolean | undefined;
  /** Comparação ativa agora (controla a caixa ao reabrir). */
  comparacao?: PeriodoIso | null | undefined;
  /** Rótulo para leitor de tela do botão (o texto visível é o período). */
  rotulo?: string | undefined;
  /** Fixa o "hoje" (ISO). Serve a testes e à vitrine. */
  hoje?: string | undefined;
  className?: string | undefined;
};

const TELA_DE_GAVETA = "(max-width: 39.99rem)";
const MARGEM_DA_TELA = 8;
const LARGURA_DE_DOIS_MESES = "(min-width: 900px)";

function useMesesVisiveis(): 1 | 2 {
  const [quantos, setQuantos] = useState<1 | 2>(1);
  useEffect(() => {
    const consulta = window.matchMedia(LARGURA_DE_DOIS_MESES);
    const atualizar = () => setQuantos(consulta.matches ? 2 : 1);
    atualizar();
    consulta.addEventListener("change", atualizar);
    return () => consulta.removeEventListener("change", atualizar);
  }, []);
  return quantos;
}

const FOCAVEIS =
  'button:not([disabled]), input:not([disabled]), [tabindex="0"]';

type Rascunho = { inicio: string; fim: string | null };

export function SeletorDePeriodo({
  value,
  onChange,
  min,
  max,
  fuso = FUSO_PADRAO,
  permitirComparacao = false,
  comparacao = null,
  rotulo = "Período",
  hoje: hojeFixo,
  className,
}: SeletorDePeriodoProps) {
  const id = useId();
  const idPainel = `${id}-painel`;
  const hoje = hojeFixo ?? hojeNoFuso(fuso);
  const [aberto, setAberto] = useState(false);

  const gatilho = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);

  const fechar = useCallback(() => {
    setAberto(false);
    gatilho.current?.focus();
  }, []);

  // Clique fora cancela (no desktop; no celular o fundo escurecido faz isso).
  useEffect(() => {
    if (!aberto) return;
    function aoApontar(evento: PointerEvent) {
      const alvo = evento.target as Node;
      if (painel.current?.contains(alvo) || gatilho.current?.contains(alvo)) {
        return;
      }
      setAberto(false);
    }
    document.addEventListener("pointerdown", aoApontar);
    return () => document.removeEventListener("pointerdown", aoApontar);
  }, [aberto]);

  // Em tela larga a janela é `fixed` (escapa de `overflow` dos pais) e
  // acompanha o botão; no celular o CSS a ancora embaixo da tela.
  useEffect(() => {
    if (!aberto) return;
    function posicionar() {
      const caixa = painel.current;
      const botao = gatilho.current;
      if (caixa === null || botao === null) return;
      if (window.matchMedia(TELA_DE_GAVETA).matches) {
        caixa.style.left = "";
        caixa.style.top = "";
        return;
      }
      const ancora = botao.getBoundingClientRect();
      const largura = caixa.offsetWidth;
      const altura = caixa.offsetHeight;
      const esquerda = Math.max(
        MARGEM_DA_TELA,
        Math.min(ancora.left, window.innerWidth - largura - MARGEM_DA_TELA),
      );
      let topo = ancora.bottom + 8;
      const acima = ancora.top - altura - 8;
      if (topo + altura > window.innerHeight - MARGEM_DA_TELA && acima >= MARGEM_DA_TELA) {
        topo = acima;
      }
      caixa.style.left = `${esquerda}px`;
      caixa.style.top = `${Math.max(MARGEM_DA_TELA, topo)}px`;
    }
    posicionar();
    const observador = new ResizeObserver(posicionar);
    if (painel.current !== null) observador.observe(painel.current);
    window.addEventListener("resize", posicionar);
    window.addEventListener("scroll", posicionar, true);
    return () => {
      observador.disconnect();
      window.removeEventListener("resize", posicionar);
      window.removeEventListener("scroll", posicionar, true);
    };
  }, [aberto]);

  const texto = descreverPeriodo(value, hoje);

  return (
    <div className={["sc-periodo", className].filter(Boolean).join(" ")}>
      <button
        ref={gatilho}
        type="button"
        className="sc-periodo__gatilho"
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-controls={aberto ? idPainel : undefined}
        onClick={() => setAberto((atual) => !atual)}
      >
        <IconeCalendario />
        <span className="sc-so-leitor">{rotulo}: </span>
        <span className="sc-periodo__texto">{texto}</span>
        {comparacao !== null && (
          <span className="sc-periodo__selo">vs. anterior</span>
        )}
      </button>
      {aberto && (
        <>
          <div
            className="sc-periodo__fundo"
            aria-hidden="true"
            onClick={() => setAberto(false)}
          />
          <JanelaDoPeriodo
            ref={painel}
            id={idPainel}
            rotulo={rotulo}
            value={value}
            min={min}
            max={max}
            hoje={hoje}
            permitirComparacao={permitirComparacao}
            comparandoInicial={comparacao !== null}
            aoCancelar={fechar}
            aoAplicar={(periodo, anterior) => {
              onChange(periodo, anterior);
              fechar();
            }}
          />
        </>
      )}
    </div>
  );
}

type JanelaProps = {
  ref: React.Ref<HTMLDivElement>;
  id: string;
  rotulo: string;
  value: PeriodoIso;
  min: string | undefined;
  max: string | undefined;
  hoje: string;
  permitirComparacao: boolean;
  comparandoInicial: boolean;
  aoCancelar: () => void;
  aoAplicar: (periodo: PeriodoIso, anterior: PeriodoIso | null) => void;
};

function JanelaDoPeriodo({
  ref,
  id,
  rotulo,
  value,
  min,
  max,
  hoje,
  permitirComparacao,
  comparandoInicial,
  aoCancelar,
  aoAplicar,
}: JanelaProps) {
  const quantos = useMesesVisiveis();
  const [rascunho, setRascunho] = useState<Rascunho>({
    inicio: value.inicio,
    fim: value.fim,
  });
  const [foco, setFoco] = useState(() =>
    limitarData(value.inicio, min, max),
  );
  const [mesVisivel, setMesVisivel] = useState(() =>
    primeiroDoMes(limitarData(value.inicio, min, max)),
  );
  const [ponteiro, setPonteiro] = useState<string | null>(null);
  const [comparar, setComparar] = useState(comparandoInicial);
  const raiz = useRef<HTMLDivElement | null>(null);

  // Mantém a data focada dentro dos meses que estão na tela.
  const ultimoMesVisivel = somarMeses(mesVisivel, quantos - 1);
  const mesesNaTela = [...Array(quantos).keys()].map((n) =>
    somarMeses(mesVisivel, n),
  );

  function irPara(data: string) {
    const alvo = limitarData(data, min, max);
    setFoco(alvo);
    const mesDoAlvo = primeiroDoMes(alvo);
    if (compararDatas(mesDoAlvo, mesVisivel) < 0) {
      setMesVisivel(mesDoAlvo);
    } else if (compararDatas(mesDoAlvo, primeiroDoMes(ultimoMesVisivel)) > 0) {
      setMesVisivel(somarMeses(mesDoAlvo, -(quantos - 1)));
    }
  }

  // Foco inicial no dia atual da grade; depois, a cada mudança de `foco` por
  // teclado, o botão certo recebe o foco.
  const precisaFocar = useRef(true);
  useEffect(() => {
    if (!precisaFocar.current) return;
    precisaFocar.current = false;
    raiz.current
      ?.querySelector<HTMLButtonElement>(`[data-iso="${foco}"]`)
      ?.focus({ preventScroll: true });
  }, [foco, mesVisivel]);

  function moverFoco(data: string) {
    precisaFocar.current = true;
    irPara(data);
  }

  function aoTeclarNaGrade(evento: KeyboardEvent<HTMLElement>) {
    const passo: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const teclas = evento.key;
    if (teclas in passo) {
      evento.preventDefault();
      moverFoco(somarDias(foco, passo[teclas] as number));
    } else if (teclas === "Home") {
      evento.preventDefault();
      moverFoco(somarDias(foco, -diaDaSemana(foco)));
    } else if (teclas === "End") {
      evento.preventDefault();
      moverFoco(somarDias(foco, 6 - diaDaSemana(foco)));
    } else if (teclas === "PageUp" || teclas === "PageDown") {
      evento.preventDefault();
      const sentido = teclas === "PageUp" ? -1 : 1;
      moverFoco(somarMeses(foco, sentido * (evento.shiftKey ? 12 : 1)));
    }
  }

  function escolher(iso: string) {
    if (dataBloqueada(iso, min, max)) return;
    setFoco(iso);
    if (rascunho.fim !== null) {
      setRascunho({ inicio: iso, fim: null });
    } else {
      const { inicio, fim } = ordenarPeriodo(rascunho.inicio, iso);
      setRascunho({ inicio, fim });
    }
  }

  function escolherAtalho(idDoAtalho: (typeof ATALHOS)[number]["id"]) {
    const bruto = periodoDoAtalho(idDoAtalho, hoje);
    const inicio = limitarData(bruto.inicio, min, max);
    const fim = limitarData(bruto.fim, min, max);
    setRascunho({ inicio, fim });
    setFoco(fim);
    setMesVisivel(
      primeiroDoMes(somarMeses(fim, -(quantos - 1))) < primeiroDoMes(inicio)
        ? primeiroDoMes(inicio)
        : primeiroDoMes(somarMeses(fim, -(quantos - 1))),
    );
  }

  const fimEfetivo =
    rascunho.fim ?? (ponteiro !== null && ponteiro !== "" ? ponteiro : null);
  const faixa =
    fimEfetivo === null
      ? { inicio: rascunho.inicio, fim: rascunho.inicio }
      : ordenarPeriodo(rascunho.inicio, fimEfetivo);
  const completo = rascunho.fim !== null;
  const periodoEscolhido: PeriodoIso | null = completo
    ? { inicio: rascunho.inicio, fim: rascunho.fim as string }
    : null;
  const anterior =
    periodoEscolhido === null ? null : periodoAnterior(periodoEscolhido);

  function aoTeclarNaJanela(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key === "Escape") {
      evento.stopPropagation();
      aoCancelar();
      return;
    }
    if (evento.key !== "Tab") return;
    const itens = Array.from(
      raiz.current?.querySelectorAll<HTMLElement>(FOCAVEIS) ?? [],
    ).filter((item) => item.tabIndex >= 0);
    if (itens.length === 0) return;
    const primeiro = itens[0] as HTMLElement;
    const ultimo = itens[itens.length - 1] as HTMLElement;
    const ativo = document.activeElement;
    if (evento.shiftKey && ativo === primeiro) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && ativo === ultimo) {
      evento.preventDefault();
      primeiro.focus();
    }
  }

  const podeVoltar =
    min === undefined || compararDatas(primeiroDoMes(min), mesVisivel) < 0;
  const podeAvancar =
    max === undefined ||
    compararDatas(primeiroDoMes(ultimoMesVisivel), primeiroDoMes(max)) < 0;

  const tituloId = `${id}-titulo`;

  return (
    <div
      ref={(no) => {
        raiz.current = no;
        if (typeof ref === "function") ref(no);
        else if (ref !== null) ref.current = no;
      }}
      id={id}
      className="sc-periodo__janela"
      role="dialog"
      aria-modal="true"
      aria-labelledby={tituloId}
      onKeyDown={aoTeclarNaJanela}
    >
      <div className="sc-periodo__cabecalho">
        <h2 className="sc-periodo__titulo" id={tituloId}>
          Escolher período
        </h2>
        <button
          type="button"
          className="sc-periodo__fechar"
          onClick={aoCancelar}
        >
          <IconeFechar />
          <span className="sc-so-leitor">Fechar sem aplicar</span>
        </button>
      </div>

      <div className="sc-periodo__corpo">
        <ul className="sc-periodo__atalhos" aria-label={`Atalhos de ${rotulo.toLowerCase()}`}>
          {ATALHOS.map((atalho) => {
            const alvo = periodoDoAtalho(atalho.id, hoje);
            const ativo =
              completo &&
              rascunho.inicio === limitarData(alvo.inicio, min, max) &&
              rascunho.fim === limitarData(alvo.fim, min, max);
            return (
              <li key={atalho.id}>
                <button
                  type="button"
                  className="sc-periodo__atalho"
                  aria-pressed={ativo}
                  onClick={() => escolherAtalho(atalho.id)}
                >
                  {atalho.rotulo}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="sc-periodo__calendario">
          <div className="sc-periodo__meses" onKeyDown={aoTeclarNaGrade}>
            {mesesNaTela.map((mes, posicao) => {
              const ano = Number(mes.slice(0, 4));
              const numero = Number(mes.slice(5, 7)) - 1;
              const idGrade = `${id}-mes-${mes}`;
              return (
                <div className="sc-periodo__mes" key={mes}>
                  <div className="sc-periodo__navegacao">
                    {posicao === 0 ? (
                      <button
                        type="button"
                        className="sc-periodo__seta"
                        disabled={!podeVoltar}
                        onClick={() => setMesVisivel(somarMeses(mesVisivel, -1))}
                      >
                        <IconeVoltar />
                        <span className="sc-so-leitor">Mês anterior</span>
                      </button>
                    ) : (
                      <span className="sc-periodo__seta-vazia" />
                    )}
                    <h3
                      className="sc-periodo__mes-nome"
                      id={`${idGrade}-nome`}
                      aria-live="polite"
                    >
                      {nomeDoMes(ano, numero)}
                    </h3>
                    {posicao === quantos - 1 ? (
                      <button
                        type="button"
                        className="sc-periodo__seta"
                        disabled={!podeAvancar}
                        onClick={() => setMesVisivel(somarMeses(mesVisivel, 1))}
                      >
                        <IconeAvancar />
                        <span className="sc-so-leitor">Próximo mês</span>
                      </button>
                    ) : (
                      <span className="sc-periodo__seta-vazia" />
                    )}
                  </div>
                  <table
                    className="sc-periodo__grade"
                    role="grid"
                    aria-labelledby={`${idGrade}-nome`}
                    aria-multiselectable="true"
                  >
                    <thead>
                      <tr>
                        {DIAS_DA_SEMANA.map((dia) => (
                          <th
                            key={dia.longo}
                            scope="col"
                            abbr={dia.longo}
                            aria-label={dia.longo}
                            className="sc-periodo__dia-semana"
                          >
                            {dia.curto}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {semanasDoMes(ano, numero).map((semana) => (
                        <tr key={semana[0]?.iso}>
                          {semana.map(({ iso, foraDoMes }) => {
                            if (foraDoMes) {
                              return (
                                <td
                                  key={iso}
                                  role="gridcell"
                                  className="sc-periodo__celula sc-periodo__celula--fora"
                                />
                              );
                            }
                            const bloqueado = dataBloqueada(iso, min, max);
                            const dentro =
                              iso >= faixa.inicio && iso <= faixa.fim;
                            const ehInicio = iso === faixa.inicio;
                            const ehFim = iso === faixa.fim;
                            const previa = !completo && dentro && fimEfetivo !== null;
                            return (
                              <td
                                key={iso}
                                role="gridcell"
                                aria-selected={dentro && !previa ? true : undefined}
                                className={[
                                  "sc-periodo__celula",
                                  dentro && "sc-periodo__celula--no-intervalo",
                                  previa && "sc-periodo__celula--previa",
                                  dentro && ehInicio && "sc-periodo__celula--inicio",
                                  dentro && ehFim && "sc-periodo__celula--fim",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                              >
                                <button
                                  type="button"
                                  className={[
                                    "sc-periodo__dia",
                                    iso === hoje && "sc-periodo__dia--hoje",
                                    dentro && (ehInicio || ehFim) && "sc-periodo__dia--ponta",
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                  data-iso={iso}
                                  tabIndex={iso === foco ? 0 : -1}
                                  disabled={bloqueado}
                                  aria-label={`${descreverDiaPorExtenso(iso)}${iso === hoje ? ", hoje" : ""}`}
                                  aria-current={iso === hoje ? "date" : undefined}
                                  onClick={() => escolher(iso)}
                                  onFocus={() => {
                                    setFoco(iso);
                                    setPonteiro(iso);
                                  }}
                                  onMouseEnter={() => setPonteiro(iso)}
                                >
                                  {Number(iso.slice(8, 10))}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>

          <p className="sc-periodo__resumo" aria-live="polite">
            {periodoEscolhido !== null
              ? descreverIntervalo(periodoEscolhido)
              : `Início em ${descreverIntervalo({ inicio: rascunho.inicio, fim: rascunho.inicio })}. Escolha o último dia.`}
          </p>

          {permitirComparacao && (
            <label className="sc-periodo__comparar">
              <input
                type="checkbox"
                checked={comparar}
                onChange={(evento) => setComparar(evento.target.checked)}
              />
              <span>
                Comparar com o período anterior
                {comparar && anterior !== null && (
                  <span className="sc-periodo__comparar-detalhe">
                    {descreverIntervalo(anterior)}
                  </span>
                )}
              </span>
            </label>
          )}
        </div>
      </div>

      <div className="sc-periodo__rodape">
        <button
          type="button"
          className="sc-botao sc-botao--secundaria"
          onClick={aoCancelar}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="sc-botao sc-botao--primaria"
          disabled={periodoEscolhido === null}
          onClick={() => {
            if (periodoEscolhido === null) return;
            aoAplicar(
              periodoEscolhido,
              permitirComparacao && comparar ? anterior : null,
            );
          }}
        >
          Aplicar
        </button>
      </div>
    </div>
  );
}
