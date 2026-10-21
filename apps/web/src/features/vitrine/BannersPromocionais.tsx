"use client";

/**
 * Os banners promocionais do cardápio: uma faixa larga que troca sozinha.
 *
 * O ARRASTE É DO CSS. A faixa é uma lista que rola na horizontal com
 * `scroll-snap`: o dedo arrasta e o banner encaixa, sem biblioteca de
 * carrossel. Sem script, continua sendo isso — uma faixa rolável com todos os
 * banners —, e o script só acrescenta a troca automática, as setas e os pontos.
 *
 * QUEM PEDE MOVIMENTO É A PESSOA, NÃO A FAIXA. A troca automática (a cada 5 s)
 * para quando o mouse está em cima, quando o foco está dentro, quando o dedo
 * encosta, e nunca começa para quem pediu menos movimento. E há o botão de
 * pausar, porque conteúdo que se move sozinho sem como parar é violação
 * conhecida de acessibilidade (WCAG 2.2.2).
 *
 * IMAGEM DIFERENTE POR LARGURA. Cada banner traz uma arte larga para o
 * computador e outra para o celular, num `<picture>`: a mesma arte cortada nas
 * duas proporções perde o texto que o dono escreveu nela.
 *
 * Zero banners: a seção não existe. Um banner: aparece parado, sem pontos nem
 * setas.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconeAvancar,
  IconePausar,
  IconeTocar,
  IconeVoltar,
} from "@simpleclick/ui";

/** Um banner como a tela o recebe (o mesmo formato do contrato). */
export interface BannerNaTela {
  readonly id: string;
  readonly imagemDesktop: string;
  readonly imagemMobile: string;
  readonly alt: string;
  readonly link?: string | null | undefined;
  readonly titulo?: string | null | undefined;
}

export interface BannersPromocionaisProps {
  readonly banners: readonly BannerNaTela[];
  /** Quanto tempo cada banner fica, em milissegundos. */
  readonly intervalo?: number | undefined;
}

/** A partir desta largura vale a arte do computador. Igual ao CSS. */
const LARGURA_DO_COMPUTADOR = "(min-width: 640px)";

/** Depois de um toque, quanto tempo a faixa espera antes de voltar a girar. */
const ESPERA_DEPOIS_DO_TOQUE = 8000;

/** Link de fora do site abre na mesma aba, mas sem passar quem indicou. */
function eExterno(link: string): boolean {
  return /^https?:\/\//i.test(link);
}

export function BannersPromocionais({
  banners,
  intervalo = 5000,
}: BannersPromocionaisProps) {
  const trilho = useRef<HTMLUListElement>(null);
  const [atual, setAtual] = useState(0);
  const [pausadoPelaPessoa, setPausadoPelaPessoa] = useState(false);
  const [emUso, setEmUso] = useState(false);
  const [poucoMovimento, setPoucoMovimento] = useState(true);
  const esperaDoToque = useRef<ReturnType<typeof setTimeout> | null>(null);

  const quantos = banners.length;
  const gira = quantos > 1 && !poucoMovimento && !pausadoPelaPessoa && !emUso;

  // A preferência é lida no navegador. Até lá, vale "pouco movimento": a faixa
  // nasce parada e só começa a girar quando se sabe que pode.
  useEffect(() => {
    const consulta = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPoucoMovimento(consulta.matches);
    const aoMudar = () => setPoucoMovimento(consulta.matches);
    consulta.addEventListener("change", aoMudar);
    return () => consulta.removeEventListener("change", aoMudar);
  }, []);

  const irPara = useCallback(
    (indice: number) => {
      const lista = trilho.current;
      if (lista === null || quantos === 0) return;
      const destino = ((indice % quantos) + quantos) % quantos;
      lista.scrollTo({
        left: destino * lista.clientWidth,
        behavior: poucoMovimento ? "auto" : "smooth",
      });
    },
    [quantos, poucoMovimento],
  );

  // O banner atual é o que está encaixado na faixa — venha a rolagem do dedo,
  // das setas ou da troca automática. Uma fonte só, e os pontos nunca mentem.
  useEffect(() => {
    const lista = trilho.current;
    if (lista === null) return;
    let agendado = false;
    function conferir() {
      agendado = false;
      if (lista === null || lista.clientWidth === 0) return;
      setAtual(Math.round(lista.scrollLeft / lista.clientWidth));
    }
    function aoRolar() {
      if (agendado) return;
      agendado = true;
      requestAnimationFrame(conferir);
    }
    lista.addEventListener("scroll", aoRolar, { passive: true });
    return () => lista.removeEventListener("scroll", aoRolar);
  }, []);

  useEffect(() => {
    if (!gira) return;
    const relogio = setInterval(() => {
      // Aba escondida não gira: ninguém está olhando.
      if (document.hidden) return;
      const lista = trilho.current;
      if (lista === null || lista.clientWidth === 0) return;
      irPara(Math.round(lista.scrollLeft / lista.clientWidth) + 1);
    }, intervalo);
    return () => clearInterval(relogio);
  }, [gira, intervalo, irPara]);

  useEffect(
    () => () => {
      if (esperaDoToque.current !== null) clearTimeout(esperaDoToque.current);
    },
    [],
  );

  if (quantos === 0) return null;

  function aoTocar() {
    setEmUso(true);
    if (esperaDoToque.current !== null) clearTimeout(esperaDoToque.current);
    esperaDoToque.current = setTimeout(
      () => setEmUso(false),
      ESPERA_DEPOIS_DO_TOQUE,
    );
  }

  return (
    <section
      className="sc-banners"
      aria-roledescription="carrossel"
      aria-label="Promoções"
      onMouseEnter={() => setEmUso(true)}
      onMouseLeave={() => setEmUso(false)}
      onFocus={() => setEmUso(true)}
      onBlur={(evento) => {
        if (
          !evento.currentTarget.contains(evento.relatedTarget as Node | null)
        ) {
          setEmUso(false);
        }
      }}
      onTouchStart={aoTocar}
    >
      <ul
        className="sc-banners__trilho"
        ref={trilho}
        // Com um banner só não há o que rolar, e a faixa não precisa de foco.
        {...(quantos > 1 ? { tabIndex: 0 } : {})}
        aria-label="Banners"
        // O leitor de tela não ouve a troca automática: anunciar um banner novo
        // a cada 5 s atropelaria o que a pessoa estiver ouvindo. Parado, ele
        // passa a anunciar a troca feita por ela.
        aria-live={gira ? "off" : "polite"}
      >
        {banners.map((banner, indice) => {
          const conteudo = (
            <>
              <picture className="sc-banners__imagem">
                <source
                  media={LARGURA_DO_COMPUTADOR}
                  srcSet={banner.imagemDesktop}
                />
                <img
                  src={banner.imagemMobile}
                  alt={banner.alt}
                  // O primeiro banner é a maior imagem da primeira tela; os
                  // outros esperam a vez.
                  loading={indice === 0 ? "eager" : "lazy"}
                  decoding="async"
                  width={800}
                  height={450}
                />
              </picture>
              {banner.titulo ? (
                <span className="sc-banners__texto">
                  <span>{banner.titulo}</span>
                </span>
              ) : null}
            </>
          );
          return (
            <li
              key={banner.id}
              className="sc-banners__item"
              aria-roledescription="banner"
              aria-label={`${indice + 1} de ${quantos}`}
              {...(indice === atual ? {} : { "aria-hidden": true })}
            >
              {banner.link ? (
                <a
                  className="sc-banners__link"
                  href={banner.link}
                  tabIndex={indice === atual ? undefined : -1}
                  {...(eExterno(banner.link)
                    ? { rel: "noopener noreferrer" }
                    : {})}
                >
                  {conteudo}
                </a>
              ) : (
                <div className="sc-banners__link">{conteudo}</div>
              )}
            </li>
          );
        })}
      </ul>

      {quantos > 1 ? (
        <div className="sc-banners__controles">
          <button
            type="button"
            className="sc-banners__seta sc-banners__seta--anterior"
            onClick={() => irPara(atual - 1)}
            aria-label="Banner anterior"
          >
            <IconeVoltar aria-hidden="true" />
          </button>
          <button
            type="button"
            className="sc-banners__seta sc-banners__seta--proxima"
            onClick={() => irPara(atual + 1)}
            aria-label="Próximo banner"
          >
            <IconeAvancar aria-hidden="true" />
          </button>

          <div className="sc-banners__rodape">
            <button
              type="button"
              className="sc-banners__pausa"
              onClick={() => setPausadoPelaPessoa((antes) => !antes)}
              // Botão de alternar: o nome fica fixo e o estado vai em
              // `aria-pressed`, que o leitor de tela lê como "pressionado".
              aria-label="Pausar a troca automática"
              aria-pressed={pausadoPelaPessoa}
              // Quem pediu menos movimento não tem troca automática para pausar.
              hidden={poucoMovimento}
            >
              {pausadoPelaPessoa ? (
                <IconeTocar aria-hidden="true" />
              ) : (
                <IconePausar aria-hidden="true" />
              )}
            </button>
            <ol className="sc-banners__pontos">
              {banners.map((banner, indice) => (
                <li key={banner.id}>
                  <button
                    type="button"
                    className="sc-banners__ponto"
                    onClick={() => irPara(indice)}
                    aria-label={`Ir para o banner ${indice + 1}`}
                    {...(indice === atual
                      ? { "aria-current": "true" as const }
                      : {})}
                  />
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : null}
    </section>
  );
}
