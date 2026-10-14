import { createElement } from "react";
import type { LucideIcon, LucideProps } from "lucide-react";
import {
  ArrowDown,
  ArrowUp,
  ArrowLeftRight,
  ArrowUpDown,
  Check,
  ChartColumn,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  Eye,
  EyeOff,
  House,
  Info,
  LoaderCircle,
  LogOut,
  Menu,
  Minus,
  Package,
  Pencil,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  Tags,
  Trash2,
  TriangleAlert,
  User,
  Users,
  X,
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
