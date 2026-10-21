import { createElement } from "react";
import type { LucideIcon, LucideProps } from "lucide-react";
import {
  Boxes,
  Layers,
  ListPlus,
  CircleDashed,
  MessageSquareText,
  Compass,
  LogIn,
  UserPlus,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Banknote,
  BookOpen,
  CalendarDays,
  Clock,
  CreditCard,
  MapPin,
  MessageCircle,
  QrCode,
  Truck,
  SlidersHorizontal,
  Pause,
  Play,
  ArrowUp,
  ArrowLeftRight,
  ArrowUpDown,
  Check,
  ChartColumn,
  ChevronDown,
  CircleAlert,
  CircleHelp,
  ClipboardPlus,
  ExternalLink,
  Eye,
  EyeOff,
  House,
  LayoutDashboard,
  Info,
  LoaderCircle,
  LogOut,
  Menu,
  Minus,
  Newspaper,
  Package,
  Palette,
  Pencil,
  Plus,
  Printer,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
  Tags,
  Trash2,
  TriangleAlert,
  User,
  UserCog,
  Users,
  X,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Brush,
  Camera,
  Eraser,
  Images,
  Maximize,
  Redo2,
  Send,
  Sticker,
  SwitchCamera,
  Tag,
  Type,
  Undo2,
  Video,
  Zap,
  ZapOff,
  Crop,
  Crosshair,
  FlipHorizontal2,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

/**
 * Os ícones do design system, um a um.
 *
 * Cada ícone é importado pelo nome, e não pelo pacote inteiro: o empacotador
 * leva para o navegador só os que alguém usou. Quem precisar de um ícone novo
 * acrescenta aqui — tela nenhuma importa de `lucide-react` direto, para o
 * desenho (tamanho e traço) continuar o mesmo em todo o produto.
 *
 * O lucide já esconde o ícone do leitor de tela (`aria-hidden`) quando ele não
 * recebe nome. Ícone que é o ÚNICO sinal de uma ação ganha nome no botão que o
 * contém (veja `Botao` com `soIcone`), e não no desenho.
 */

/** Tamanho padrão, em pixels: 20 ao lado de texto do corpo. */
export const TAMANHO_DO_ICONE = 20;
/** Traço padrão: mais fino que o do lucide, para não pesar ao lado do Inter. */
export const TRACO_DO_ICONE = 1.75;

export type IconeProps = LucideProps;
export type Icone = (props: IconeProps) => ReturnType<typeof createElement>;

/** Dá ao ícone do lucide o tamanho e o traço do design system. */
function comPadrao(Desenho: LucideIcon, nome: string): Icone {
  const Componente = (props: IconeProps) =>
    createElement(Desenho, {
      size: TAMANHO_DO_ICONE,
      strokeWidth: TRACO_DO_ICONE,
      ...props,
    });
  Componente.displayName = nome;
  return Componente;
}

export const IconeAdicionar = /* @__PURE__ */ comPadrao(Plus, "IconeAdicionar");
export const IconeAlerta = /* @__PURE__ */ comPadrao(
  TriangleAlert,
  "IconeAlerta",
);
export const IconeBuscar = /* @__PURE__ */ comPadrao(Search, "IconeBuscar");
export const IconeCarregando = /* @__PURE__ */ comPadrao(
  LoaderCircle,
  "IconeCarregando",
);
export const IconeConfirmar = /* @__PURE__ */ comPadrao(
  Check,
  "IconeConfirmar",
);
export const IconeConfiguracoes = /* @__PURE__ */ comPadrao(
  Settings,
  "IconeConfiguracoes",
);
export const IconeEditar = /* @__PURE__ */ comPadrao(Pencil, "IconeEditar");
export const IconeErro = /* @__PURE__ */ comPadrao(CircleAlert, "IconeErro");
export const IconeExcluir = /* @__PURE__ */ comPadrao(Trash2, "IconeExcluir");
export const IconeFechar = /* @__PURE__ */ comPadrao(X, "IconeFechar");
export const IconeInfo = /* @__PURE__ */ comPadrao(Info, "IconeInfo");
export const IconeLoja = /* @__PURE__ */ comPadrao(Store, "IconeLoja");
export const IconeMenu = /* @__PURE__ */ comPadrao(Menu, "IconeMenu");
export const IconeMostrar = /* @__PURE__ */ comPadrao(Eye, "IconeMostrar");
export const IconeOcultar = /* @__PURE__ */ comPadrao(EyeOff, "IconeOcultar");
export const IconeOrdenar = /* @__PURE__ */ comPadrao(
  ArrowUpDown,
  "IconeOrdenar",
);
export const IconeOrdemCrescente = /* @__PURE__ */ comPadrao(
  ArrowUp,
  "IconeOrdemCrescente",
);
export const IconeOrdemDecrescente = /* @__PURE__ */ comPadrao(
  ArrowDown,
  "IconeOrdemDecrescente",
);
export const IconePedido = /* @__PURE__ */ comPadrao(
  ShoppingBag,
  "IconePedido",
);
export const IconeRemover = /* @__PURE__ */ comPadrao(Minus, "IconeRemover");
export const IconeSair = /* @__PURE__ */ comPadrao(LogOut, "IconeSair");
export const IconeSeta = /* @__PURE__ */ comPadrao(ChevronDown, "IconeSeta");
export const IconeUsuario = /* @__PURE__ */ comPadrao(User, "IconeUsuario");
export const IconeAbrirFora = /* @__PURE__ */ comPadrao(
  ExternalLink,
  "IconeAbrirFora",
);
export const IconeCategoria = /* @__PURE__ */ comPadrao(Tags, "IconeCategoria");
export const IconeClientes = /* @__PURE__ */ comPadrao(Users, "IconeClientes");
export const IconeInicio = /* @__PURE__ */ comPadrao(House, "IconeInicio");
/** Painel com gráfico: a "Visão geral" do cliente e o "Início" do painel. */
export const IconeDashboard = /* @__PURE__ */ comPadrao(
  LayoutDashboard,
  "IconeDashboard",
);
export const IconeMetricas = /* @__PURE__ */ comPadrao(
  ChartColumn,
  "IconeMetricas",
);
export const IconeProduto = /* @__PURE__ */ comPadrao(Package, "IconeProduto");
export const IconeSeguranca = /* @__PURE__ */ comPadrao(
  ShieldCheck,
  "IconeSeguranca",
);
export const IconeTrocar = /* @__PURE__ */ comPadrao(
  ArrowLeftRight,
  "IconeTrocar",
);

export const IconeVoltar = /* @__PURE__ */ comPadrao(ArrowLeft, "IconeVoltar");
export const IconeAvancar = /* @__PURE__ */ comPadrao(
  ArrowRight,
  "IconeAvancar",
);
export const IconeDinheiro = /* @__PURE__ */ comPadrao(
  Banknote,
  "IconeDinheiro",
);
export const IconeHistoria = /* @__PURE__ */ comPadrao(
  BookOpen,
  "IconeHistoria",
);
export const IconeRelogio = /* @__PURE__ */ comPadrao(Clock, "IconeRelogio");
export const IconeCartao = /* @__PURE__ */ comPadrao(CreditCard, "IconeCartao");
export const IconeLocal = /* @__PURE__ */ comPadrao(MapPin, "IconeLocal");
export const IconeConversa = /* @__PURE__ */ comPadrao(
  MessageCircle,
  "IconeConversa",
);
export const IconePix = /* @__PURE__ */ comPadrao(QrCode, "IconePix");
export const IconeEntrega = /* @__PURE__ */ comPadrao(Truck, "IconeEntrega");
export const IconeFiltro = /* @__PURE__ */ comPadrao(
  SlidersHorizontal,
  "IconeFiltro",
);
export const IconePausar = /* @__PURE__ */ comPadrao(Pause, "IconePausar");
export const IconeTocar = /* @__PURE__ */ comPadrao(Play, "IconeTocar");
export const IconeEntrar = /* @__PURE__ */ comPadrao(LogIn, "IconeEntrar");
export const IconeCriarConta = /* @__PURE__ */ comPadrao(
  UserPlus,
  "IconeCriarConta",
);

export const IconeCalendario = /* @__PURE__ */ comPadrao(
  CalendarDays,
  "IconeCalendario",
);

export const IconeAjuda = /* @__PURE__ */ comPadrao(CircleHelp, "IconeAjuda");
export const IconeEquipe = /* @__PURE__ */ comPadrao(UserCog, "IconeEquipe");
export const IconeFeed = /* @__PURE__ */ comPadrao(Newspaper, "IconeFeed");
export const IconeImpressora = /* @__PURE__ */ comPadrao(
  Printer,
  "IconeImpressora",
);
export const IconePaleta = /* @__PURE__ */ comPadrao(Palette, "IconePaleta");
export const IconePedidoManual = /* @__PURE__ */ comPadrao(
  ClipboardPlus,
  "IconePedidoManual",
);
export const IconeExplorar = /* @__PURE__ */ comPadrao(
  Compass,
  "IconeExplorar",
);
export const IconeStories = /* @__PURE__ */ comPadrao(
  CircleDashed,
  "IconeStories",
);
export const IconeComentarios = /* @__PURE__ */ comPadrao(
  MessageSquareText,
  "IconeComentarios",
);
// Páginas próprias do catálogo (card #52).
export const IconeEstoque = /* @__PURE__ */ comPadrao(Boxes, "IconeEstoque");
export const IconeVariacoes = /* @__PURE__ */ comPadrao(
  Layers,
  "IconeVariacoes",
);
export const IconeOpcoes = /* @__PURE__ */ comPadrao(ListPlus, "IconeOpcoes");

// ---------------------------------------------------------------------------
// Curtir e favoritar (regra do chefe, card #49)
// ---------------------------------------------------------------------------

/** Contorno ou preenchido: o preenchido usa a cor do texto (`currentColor`). */
export type IconeMarcavelProps = IconeProps & {
  readonly preenchido?: boolean | undefined;
};

/**
 * O "brilho do Simple": a estrela de 4 pontas, de lados curvos, do logo
 * (✦). É o CURTIR do feed — nunca coração. Contorno quando não curtiu,
 * preenchido quando curtiu.
 */
const DESENHO_DO_BRILHO =
  "M12 2.5C12.7 7.6 16.4 11.3 21.5 12C16.4 12.7 12.7 16.4 12 21.5C11.3 16.4 7.6 12.7 2.5 12C7.6 11.3 11.3 7.6 12 2.5Z";

export function IconeBrilho({
  preenchido = false,
  size = TAMANHO_DO_ICONE,
  strokeWidth = TRACO_DO_ICONE,
  color = "currentColor",
  ...props
}: IconeMarcavelProps) {
  return createElement(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: preenchido ? color : "none",
      stroke: color,
      strokeWidth,
      strokeLinejoin: "round",
      "aria-hidden": props["aria-label"] === undefined ? true : undefined,
      "data-preenchido": preenchido || undefined,
      ...props,
    },
    createElement("path", { d: DESENHO_DO_BRILHO }),
  );
}
IconeBrilho.displayName = "IconeBrilho";

/**
 * A estrela de 5 pontas: é o FAVORITAR (produto ou loja). Contorno quando
 * não é favorito, preenchido quando é.
 */
export function IconeEstrela({
  preenchido = false,
  ...props
}: IconeMarcavelProps) {
  const marcado: IconeProps & { "data-preenchido"?: true } = {
    size: TAMANHO_DO_ICONE,
    strokeWidth: TRACO_DO_ICONE,
    fill: preenchido ? "currentColor" : "none",
    ...(preenchido ? { "data-preenchido": true as const } : {}),
    ...props,
  };
  return createElement(Star, marcado);
}
IconeEstrela.displayName = "IconeEstrela";

// Editor de Stories (card #84).
export const IconeCamera = /* @__PURE__ */ comPadrao(Camera, "IconeCamera");
export const IconeTrocarCamera = /* @__PURE__ */ comPadrao(
  SwitchCamera,
  "IconeTrocarCamera",
);
export const IconeFlash = /* @__PURE__ */ comPadrao(Zap, "IconeFlash");
export const IconeFlashDesligado = /* @__PURE__ */ comPadrao(
  ZapOff,
  "IconeFlashDesligado",
);
export const IconeGaleria = /* @__PURE__ */ comPadrao(Images, "IconeGaleria");
export const IconeDesenhar = /* @__PURE__ */ comPadrao(Brush, "IconeDesenhar");
export const IconeBorracha = /* @__PURE__ */ comPadrao(Eraser, "IconeBorracha");
export const IconeTexto = /* @__PURE__ */ comPadrao(Type, "IconeTexto");
export const IconeAdesivo = /* @__PURE__ */ comPadrao(Sticker, "IconeAdesivo");
export const IconeEtiqueta = /* @__PURE__ */ comPadrao(Tag, "IconeEtiqueta");
export const IconeDesfazer = /* @__PURE__ */ comPadrao(Undo2, "IconeDesfazer");
export const IconeRefazer = /* @__PURE__ */ comPadrao(Redo2, "IconeRefazer");
export const IconeAlinharEsquerda = /* @__PURE__ */ comPadrao(
  AlignLeft,
  "IconeAlinharEsquerda",
);
export const IconeAlinharCentro = /* @__PURE__ */ comPadrao(
  AlignCenter,
  "IconeAlinharCentro",
);
export const IconeAlinharDireita = /* @__PURE__ */ comPadrao(
  AlignRight,
  "IconeAlinharDireita",
);
export const IconeEnquadrar = /* @__PURE__ */ comPadrao(
  Maximize,
  "IconeEnquadrar",
);
export const IconeEnviar = /* @__PURE__ */ comPadrao(Send, "IconeEnviar");
export const IconeVideo = /* @__PURE__ */ comPadrao(Video, "IconeVideo");
export const IconeGirar = /* @__PURE__ */ comPadrao(RotateCw, "IconeGirar");
export const IconeEspelhar = /* @__PURE__ */ comPadrao(
  FlipHorizontal2,
  "IconeEspelhar",
);
/** Ajustar (recortar de novo) uma foto que já foi enviada. */
export const IconeRecortar = /* @__PURE__ */ comPadrao(Crop, "IconeRecortar");
export const IconeCentralizar = /* @__PURE__ */ comPadrao(
  Crosshair,
  "IconeCentralizar",
);
export const IconeAproximar = /* @__PURE__ */ comPadrao(
  ZoomIn,
  "IconeAproximar",
);
export const IconeAfastar = /* @__PURE__ */ comPadrao(ZoomOut, "IconeAfastar");
