/**
 * Os desenhos da landing (AC-933, AC-937).
 *
 * SÃO DESENHADOS, e não imagens carregadas. Três razões, e nenhuma é de gosto:
 * imagem é peso que atrasa a página de quem está em rede ruim; foto de banco de
 * imagens lê como modelo pronto, que é justamente o que esta página não pode
 * parecer; e traço vetorial acompanha a cor que a pessoa escolher, enquanto foto
 * fica presa na cor de quem a tirou.
 *
 * Todos usam `currentColor`, então herdam a cor do bloco onde estão. E todos são
 * decoração: a história é contada pelo texto, e por isso eles somem para quem
 * ouve a página.
 */

/** O que todo desenho recebe. */
interface DesenhoProps {
  readonly className?: string | undefined;
}

/**
 * O problema: comandas de papel espalhadas.
 *
 * Tortas e sobrepostas de propósito — papel empilhado no balcão não fica
 * alinhado, e alinhá-lo aqui contaria a história errada.
 */
export function PapeisEspalhados({ className }: DesenhoProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 240 180"
      fill="none"
      aria-hidden="true"
    >
      {[
        { x: 18, y: 96, giro: -14 },
        { x: 74, y: 62, giro: 7 },
        { x: 132, y: 84, giro: -5 },
        { x: 158, y: 34, giro: 12 },
      ].map((papel, i) => (
        <g
          key={`${papel.x}-${papel.y}`}
          transform={`translate(${papel.x} ${papel.y}) rotate(${papel.giro})`}
          opacity={0.35 + i * 0.18}
        >
          <rect
            width="62"
            height="78"
            rx="4"
            fill="currentColor"
            fillOpacity="0.08"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          {[14, 26, 38, 50].map((linha, j) => (
            <line
              key={linha}
              x1="12"
              y1={linha}
              x2={j === 3 ? 34 : 50}
              y2={linha}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.55"
            />
          ))}
          {/* O risco a caneta: o preço que mudou e ninguém atualizou. */}
          <line
            x1="12"
            y1="64"
            x2="40"
            y2="64"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <line
            x1="10"
            y1="66"
            x2="42"
            y2="62"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.7"
          />
        </g>
      ))}
    </svg>
  );
}

/**
 * O produto: do celular do cliente para a conversa do dono.
 *
 * É o caminho inteiro numa figura só — e é o caminho que o dono já conhece,
 * porque é o que ele faz à mão hoje.
 */
export function DoCelularParaAConversa({ className }: DesenhoProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 260 150"
      fill="none"
      aria-hidden="true"
    >
      {/* O celular do cliente */}
      <rect
        x="14"
        y="18"
        width="66"
        height="114"
        rx="10"
        fill="currentColor"
        fillOpacity="0.07"
        stroke="currentColor"
        strokeWidth="2"
      />
      <rect
        x="34"
        y="24"
        width="26"
        height="5"
        rx="2.5"
        fill="currentColor"
        opacity="0.5"
      />
      {[42, 58, 74].map((linha) => (
        <g key={linha}>
          <rect
            x="24"
            y={linha}
            width="14"
            height="10"
            rx="2"
            fill="currentColor"
            opacity="0.35"
          />
          <line
            x1="44"
            y1={linha + 5}
            x2="68"
            y2={linha + 5}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.55"
          />
        </g>
      ))}
      <rect
        x="24"
        y="98"
        width="46"
        height="14"
        rx="7"
        fill="currentColor"
        opacity="0.85"
      />

      {/* O caminho */}
      <path
        d="M92 76h58"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="4 6"
        opacity="0.6"
      />
      <path
        d="M146 70l8 6-8 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* A conversa do dono */}
      <path
        d="M168 34h74a8 8 0 018 8v52a8 8 0 01-8 8h-58l-14 12V42a8 8 0 018-8z"
        fill="currentColor"
        fillOpacity="0.09"
        stroke="currentColor"
        strokeWidth="2"
      />
      {[50, 62, 74].map((linha, i) => (
        <line
          key={linha}
          x1="180"
          y1={linha}
          x2={i === 2 ? 214 : 232}
          y2={linha}
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity={i === 0 ? 0.9 : 0.5}
        />
      ))}
    </svg>
  );
}

/**
 * O controle: o dia fechado em números.
 *
 * A linha sobe, e sobe com um vale no meio — linha que só sobe lê como promessa,
 * e esta figura precisa parecer um relatório, não um anúncio.
 */
export function DiaEmNumeros({ className }: DesenhoProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 240 160"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="8"
        y="12"
        width="224"
        height="136"
        rx="12"
        fill="currentColor"
        fillOpacity="0.06"
        stroke="currentColor"
        strokeWidth="1.5"
      />

      {/* Os três números do dia */}
      {[0, 1, 2].map((coluna) => (
        <g key={coluna} transform={`translate(${24 + coluna * 68} 28)`}>
          <line
            x1="0"
            y1="0"
            x2="26"
            y2="0"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.45"
          />
          <line
            x1="0"
            y1="12"
            x2={coluna === 1 ? 44 : 34}
            y2="12"
            stroke="currentColor"
            strokeWidth="7"
            strokeLinecap="round"
          />
        </g>
      ))}

      {/* A linha do movimento, com vale */}
      <path
        d="M24 118L54 100 84 108 114 78 144 88 174 58 208 66"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M24 118L54 100 84 108 114 78 144 88 174 58 208 66V132H24z"
        fill="currentColor"
        fillOpacity="0.1"
      />
      <circle cx="208" cy="66" r="4.5" fill="currentColor" />
    </svg>
  );
}

/** Os desenhos, na ordem dos capítulos que os usam. */

/**
 * A etiqueta sem preço — o capítulo de quanto custa.
 *
 * Uma etiqueta de preço com o valor riscado e um zero no lugar. É a figura mais
 * literal das quatro, e de propósito: as outras ilustram uma situação, esta
 * responde a uma pergunta direta, e resposta direta não pede metáfora.
 */
export function EtiquetaSemPreco({ className }: DesenhoProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 220 160"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* A etiqueta, com o canto cortado e o furo do barbante. */}
      <path d="M40 44h108l32 36-32 36H40a8 8 0 0 1-8-8V52a8 8 0 0 1 8-8Z" />
      <circle cx="56" cy="80" r="6" />

      {/* O preço que existiria, riscado. */}
      <path d="M84 68h56" opacity="0.45" />
      <path d="M84 92h34" opacity="0.45" />
      <path d="M78 100l70-40" />

      {/* O barbante. */}
      <path d="M32 68c-12-6-20-14-24-24" opacity="0.5" />
    </svg>
  );
}

export const DESENHOS: Readonly<
  Record<string, (props: DesenhoProps) => React.JSX.Element>
> = {
  problema: PapeisEspalhados,
  produto: DoCelularParaAConversa,
  controle: DiaEmNumeros,
  preco: EtiquetaSemPreco,
};
