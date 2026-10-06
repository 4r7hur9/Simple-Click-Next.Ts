/**
 * Pareamento do agente (T-609 — AC-623): troca o código de seis dígitos que
 * o dono gerou no painel pela credencial do agente, e grava a configuração
 * local com a impressora desta máquina.
 *
 * Uso (na pasta `apps/agente-impressao`):
 *
 *   pnpm parear --api https://api.exemplo.com --loja minha-loja \
 *     --codigo 123456 --impressora 192.168.0.50:9100 [--nome Caixa] \
 *     [--tabela cp860|cp850] [--corte parcial|total|nenhum] [--origem URL]
 *
 * Parear de novo revoga o agente anterior da loja (uma impressora por loja).
 */
import { hostname } from "node:os";
import { parseArgs } from "node:util";

import { parearNaApi } from "./cliente.ts";
import {
  gravarConfiguracao,
  lerConfiguracao,
  pastaDoAgente,
  type ConfiguracaoDoAgente,
} from "./configuracao.ts";

export interface PedidoDoPareamentoLocal {
  readonly api: string;
  readonly origem?: string;
  readonly apelido: string;
  readonly codigo: string;
  readonly nome: string;
  readonly impressora: string;
  readonly tabela?: string;
  readonly corte?: string;
}

/** Pareia na API e devolve a configuração pronta para gravar. */
export async function parear(
  pedido: PedidoDoPareamentoLocal,
  buscar?: typeof fetch,
): Promise<ConfiguracaoDoAgente> {
  const [host = "", porta = "9100"] = pedido.impressora.split(":");
  const pareado = await parearNaApi(
    {
      api: pedido.api,
      ...(pedido.origem === undefined ? {} : { origem: pedido.origem }),
      ...(buscar === undefined ? {} : { buscar }),
    },
    { apelido: pedido.apelido, codigo: pedido.codigo, nome: pedido.nome },
  );
  return lerConfiguracao({
    api: pedido.api,
    ...(pedido.origem === undefined ? {} : { origem: pedido.origem }),
    credencial: pareado.credencial,
    agente: pareado.agente,
    loja: pareado.loja,
    impressora: { host, porta: Number(porta) },
    perfil: {
      ...(pedido.tabela === undefined ? {} : { tabela: pedido.tabela }),
      ...(pedido.corte === undefined ? {} : { corte: pedido.corte }),
    },
  });
}

async function principal(): Promise<void> {
  const { values } = parseArgs({
    options: {
      api: { type: "string" },
      origem: { type: "string" },
      loja: { type: "string" },
      codigo: { type: "string" },
      nome: { type: "string", default: hostname().slice(0, 60) },
      impressora: { type: "string" },
      tabela: { type: "string" },
      corte: { type: "string" },
    },
  });
  const { api, loja, codigo, impressora } = values;
  if (!api || !loja || !codigo || !impressora) {
    process.stderr.write(
      "uso: pnpm parear --api <url> --loja <apelido> --codigo <6 dígitos> --impressora <host:porta>\n",
    );
    process.exitCode = 2;
    return;
  }
  const configuracao = await parear({
    api,
    apelido: loja,
    codigo,
    nome: values.nome,
    impressora,
    ...(values.origem === undefined ? {} : { origem: values.origem }),
    ...(values.tabela === undefined ? {} : { tabela: values.tabela }),
    ...(values.corte === undefined ? {} : { corte: values.corte }),
  });
  const pasta = pastaDoAgente();
  await gravarConfiguracao(pasta, configuracao);
  process.stdout.write(
    `agente "${configuracao.agente.nome}" pareado com a loja ${configuracao.loja.nome}; configuração em ${pasta}\n`,
  );
}

if (import.meta.main) {
  try {
    await principal();
  } catch (causa) {
    process.stderr.write(
      `pareamento falhou: ${causa instanceof Error ? causa.message : String(causa)}\n`,
    );
    process.exitCode = 1;
  }
}
