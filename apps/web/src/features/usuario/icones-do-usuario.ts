/**
 * O desenho de cada item de menu do usuário, pelo nome que a lógica de papéis
 * devolve (`lib/quem-esta-logado.ts`). Vive à parte para a lateral (painel e
 * administração) e o menu da conta do cliente dividirem a mesma tabela.
 */
import {
  IconeAbrirFora,
  IconeConfiguracoes,
  IconeCriarConta,
  IconeDashboard,
  IconeEntrar,
  IconeEstrela,
  IconeExplorar,
  IconeHistoria,
  IconeInicio,
  IconeLocal,
  IconeLoja,
  IconeMetricas,
  IconePedido,
  IconeSeguranca,
  IconeTrocar,
  IconeUsuario,
  type Icone,
} from "@simpleclick/ui";

import type { IconeDoItem } from "../../lib/quem-esta-logado.ts";
import type { IdDoItemPrincipal } from "./regras-da-navegacao.ts";

export const ICONES_DO_USUARIO: Readonly<Record<IconeDoItem, Icone>> = {
  entrar: IconeEntrar,
  "criar-conta": IconeCriarConta,
  loja: IconeInicio,
  inicio: IconeDashboard,
  pedidos: IconePedido,
  dados: IconeUsuario,
  enderecos: IconeLocal,
  favoritos: IconeEstrela,
  explorar: IconeExplorar,
  seguranca: IconeSeguranca,
  painel: IconeMetricas,
  "ver-loja": IconeAbrirFora,
  conta: IconeUsuario,
  trocar: IconeTrocar,
  admin: IconeConfiguracoes,
  auditoria: IconeSeguranca,
};

/** O desenho de cada destino do topo e da barra inferior. */
export const ICONES_DA_NAVEGACAO: Readonly<Record<IdDoItemPrincipal, Icone>> = {
  explorar: IconeExplorar,
  lojas: IconeLoja,
  favoritos: IconeEstrela,
  pedidos: IconeHistoria,
  perfil: IconeUsuario,
};
