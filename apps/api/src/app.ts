import express, { type Express } from "express";

import { corsDeOrigensFechadas, origensDoAmbiente } from "./core/cors.ts";
import { manipuladorDeErros } from "./core/erros.ts";
import { middlewareDeRegistro } from "./core/log.ts";
import { conferirAntesDeFechar } from "./modules/cart/conferir-preco.usecase.ts";
import { verCarrinho } from "./modules/cart/carrinho.usecase.ts";
import {
  criarRotasDoCarrinho,
  PREFIXO_DO_CARRINHO,
  type OpcoesDoCarrinho,
} from "./modules/cart/carrinho.routes.ts";
import { criarRotasDeSaude } from "./modules/health/health.routes.ts";
import { criarRotasDeAutenticacaoDeDesenvolvimento } from "./modules/auth/desenvolvimento.routes.ts";
import { criarRotasDasCategorias } from "./modules/catalog/categorias.routes.ts";
import { criarRotasDosProdutos } from "./modules/catalog/produtos.routes.ts";
import { criarRotasDasImagens } from "./modules/catalog/imagens.routes.ts";
import { criarRotasDosPrecos } from "./modules/catalog/precos.routes.ts";
import { criarRotasDosGruposDeEscolha } from "./modules/catalog/opcoes.routes.ts";
import { criarRotasDasVariacoes } from "./modules/catalog/variacoes.routes.ts";
import { criarRotasDoEstoque } from "./modules/catalog/estoque.routes.ts";
import { criarRotasDasEspecificacoes } from "./modules/catalog/especificacoes.routes.ts";
import {
  criarRotasDasConfiguracoes,
  type UsuarioAutenticado,
} from "./modules/stores/configuracao.routes.ts";
import type { OpcoesDasConfiguracoes } from "./modules/stores/configuracao.routes.ts";
import {
  tokenDoCabecalhoDeAutorizacao,
  verificarTokenDeAcesso,
} from "./modules/auth/token.ts";
import {
  criarRotasDePedidos,
  PREFIXO_DOS_PEDIDOS,
  type OpcoesDosPedidos,
} from "./modules/orders/pedidos.routes.ts";
import { criarRotasDaFila } from "./modules/orders/fila.routes.ts";
import type { OpcoesDaFila } from "./modules/orders/fila.routes.ts";
import {
  criarRotasDaConta,
  PREFIXO_DA_CONTA,
  type OpcoesDaConta,
} from "./modules/orders/conta.routes.ts";
import { criarRotasDoCupom } from "./modules/printing/cupom.routes.ts";
import { normalizarConfiguracaoDeImpressao } from "./modules/stores/impressao-config.usecase.ts";
import { horarioDaLoja } from "./modules/stores/horarios.usecase.ts";
import {
  fechamentoDaLoja,
  whatsappDaLoja,
} from "./modules/storefront/fechamento.usecase.ts";
import { produtoDaVitrine } from "./modules/storefront/produto.usecase.ts";
import {
  identificarLoja,
  lojaDaVitrine,
} from "./modules/storefront/resolver-loja.usecase.ts";
import {
  criarRotasDaVitrine,
  PREFIXO_DA_VITRINE,
  type OpcoesDaVitrine,
} from "./modules/storefront/vitrine.routes.ts";

/** Identificação que a raiz devolve. Sem dado de negócio: só sinal de vida. */
export const IDENTIFICACAO_DA_API = {
  servico: "simpleclick-api",
  status: "viva",
} as const;

/** Onde as verificações de saúde ficam montadas (AC-023). */
export const PREFIXO_DE_SAUDE = "/v1/health";

/** Ajustes da composição. Tudo tem padrão; teste sobrescreve o que precisa. */
export interface OpcoesDoApp {
  /**
   * Lista fechada de origens autorizadas. Sem ela, vale `ORIGENS_PERMITIDAS`
   * do ambiente — e, na falta das duas, a lista fica VAZIA: nenhuma origem
   * autorizada a mudar estado. Ambiente mal configurado fecha a porta em vez
   * de abrir todas.
   */
  readonly origens?: readonly string[];
  /**
   * Como a vitrine alcança o banco e que horas são. Trocável para a prova
   * exercitar a rota sem subir servidor e sem depender do relógio da máquina.
   */
  readonly vitrine?: Partial<OpcoesDaVitrine>;
  /** O mesmo, para o carrinho. */
  readonly carrinho?: Partial<OpcoesDoCarrinho>;
  /** O mesmo, para o fechamento do pedido. */
  readonly pedidos?: Partial<OpcoesDosPedidos>;
  /** O mesmo, para as configurações da loja (T-900). */
  readonly configuracoes?: Partial<OpcoesDasConfiguracoes>;
  /** O mesmo, para a fila de pedidos do dono. */
  readonly fila?: Partial<OpcoesDaFila>;
  /** O mesmo, para a área da conta do cliente. */
  readonly conta?: Partial<OpcoesDaConta>;
}

/**
 * Monta o Express e devolve a aplicação **sem escutar porta**.
 *
 * A composição e a escuta ficam separadas de propósito: teste de integração
 * precisa da aplicação montada, mas não pode disputar porta com o ambiente
 * local nem com outro teste rodando em paralelo. Quem escuta é `main.ts`.
 */
export function criarApp(opcoes: OpcoesDoApp = {}): Express {
  const app = express();

  // Não anunciar a tecnologia do servidor: informação que só serve a quem
  // procura vulnerabilidade conhecida.
  app.disable("x-powered-by");

  // Primeiro de todos: é ele que abre o contexto da requisição, e tudo que
  // vier depois precisa do identificador já existindo para que as linhas de
  // registro casem umas com as outras (AC-021) — inclusive a recusa por
  // origem, que sem isso seria registrada solta, sem dizer de qual requisição
  // veio.
  app.use(middlewareDeRegistro());

  // Logo em seguida, e antes de qualquer leitura de corpo: requisição de origem
  // estranha é recusada sem que a API gaste trabalho lendo o que ela mandou
  // (AC-125..AC-128).
  app.use(
    corsDeOrigensFechadas({
      origens:
        opcoes.origens ?? origensDoAmbiente(process.env.ORIGENS_PERMITIDAS),
    }),
  );

  app.use(express.json({ limit: "1mb" }));

  // Antes das rotas de negócio: saber se a API pode receber tráfego não pode
  // depender de nada que ela ainda esteja montando (AC-023).
  app.use(PREFIXO_DE_SAUDE, criarRotasDeSaude());

  // Usuário de teste local: só existe quando uma credencial explícita foi
  // colocada no ambiente e a rota recusa produção. A autenticação de produção
  // entra aqui quando a persistência da identidade for conectada à API.
  app.use("/v1/auth", criarRotasDeAutenticacaoDeDesenvolvimento());

  app.use(
    "/v1/lojas",
    criarRotasDasConfiguracoes({
      resolverLoja: identificarLoja,
      autenticar: (requisicao) => {
        const token = tokenDoCabecalhoDeAutorizacao(
          requisicao.headers.authorization,
        );
        const segredo = process.env.JWT_SECRET?.trim();
        if (!token || !segredo) return null;

        try {
          const alegacoes = verificarTokenDeAcesso(token, segredo);
          if (alegacoes.papel !== "OWNER") return null;
          const usuario: UsuarioAutenticado = {
            identidadeId: alegacoes.identidadeId,
            papel: "OWNER",
          };
          return usuario;
        } catch {
          return null;
        }
      },
      ...opcoes.configuracoes,
    }),
  );

  app.use(
    "/v1/lojas",
    criarRotasDaFila({
      resolverLoja: identificarLoja,
      autenticar: (requisicao) => {
        const token = tokenDoCabecalhoDeAutorizacao(
          requisicao.headers.authorization,
        );
        const segredo = process.env.JWT_SECRET?.trim();
        if (!token || !segredo) return null;

        try {
          const alegacoes = verificarTokenDeAcesso(token, segredo);
          if (alegacoes.papel !== "OWNER") return null;
          return {
            identidadeId: alegacoes.identidadeId,
            papel: "OWNER" as const,
          };
        } catch {
          return null;
        }
      },
      ...opcoes.fila,
    }),
  );

  app.use(
    "/v1/lojas",
    criarRotasDasCategorias({
      resolverLoja: identificarLoja,
      autenticar: (requisicao) => {
        const token = tokenDoCabecalhoDeAutorizacao(
          requisicao.headers.authorization,
        );
        const segredo = process.env.JWT_SECRET?.trim();
        if (!token || !segredo) return null;

        try {
          const alegacoes = verificarTokenDeAcesso(token, segredo);
          if (alegacoes.papel !== "OWNER") return null;
          return {
            identidadeId: alegacoes.identidadeId,
            papel: "OWNER",
          };
        } catch {
          return null;
        }
      },
    }),
  );

  app.use(
    "/v1/lojas",
    criarRotasDosProdutos({
      resolverLoja: identificarLoja,
      autenticar: (requisicao) => {
        const token = tokenDoCabecalhoDeAutorizacao(
          requisicao.headers.authorization,
        );
        const segredo = process.env.JWT_SECRET?.trim();
        if (!token || !segredo) return null;

        try {
          const alegacoes = verificarTokenDeAcesso(token, segredo);
          if (alegacoes.papel !== "OWNER") return null;
          return {
            identidadeId: alegacoes.identidadeId,
            papel: "OWNER" as const,
          };
        } catch {
          return null;
        }
      },
    }),
  );

  app.use(
    "/v1/lojas",
    criarRotasDasImagens({
      resolverLoja: identificarLoja,
      autenticar: (requisicao) => {
        const token = tokenDoCabecalhoDeAutorizacao(
          requisicao.headers.authorization,
        );
        const segredo = process.env.JWT_SECRET?.trim();
        if (!token || !segredo) return null;

        try {
          const alegacoes = verificarTokenDeAcesso(token, segredo);
          if (alegacoes.papel !== "OWNER") return null;
          return {
            identidadeId: alegacoes.identidadeId,
            papel: "OWNER" as const,
          };
        } catch {
          return null;
        }
      },
    }),
  );

  app.use(
    "/v1/lojas",
    criarRotasDosPrecos({
      resolverLoja: identificarLoja,
      autenticar: (requisicao) => {
        const token = tokenDoCabecalhoDeAutorizacao(
          requisicao.headers.authorization,
        );
        const segredo = process.env.JWT_SECRET?.trim();
        if (!token || !segredo) return null;

        try {
          const alegacoes = verificarTokenDeAcesso(token, segredo);
          if (alegacoes.papel !== "OWNER") return null;
          return {
            identidadeId: alegacoes.identidadeId,
            papel: "OWNER" as const,
          };
        } catch {
          return null;
        }
      },
    }),
  );

  app.use(
    "/v1/lojas",
    criarRotasDosGruposDeEscolha({
      resolverLoja: identificarLoja,
      autenticar: (requisicao) => {
        const token = tokenDoCabecalhoDeAutorizacao(
          requisicao.headers.authorization,
        );
        const segredo = process.env.JWT_SECRET?.trim();
        if (!token || !segredo) return null;

        try {
          const alegacoes = verificarTokenDeAcesso(token, segredo);
          if (alegacoes.papel !== "OWNER") return null;
          return {
            identidadeId: alegacoes.identidadeId,
            papel: "OWNER" as const,
          };
        } catch {
          return null;
        }
      },
    }),
  );

  app.use(
    "/v1/lojas",
    criarRotasDasVariacoes({
      resolverLoja: identificarLoja,
      autenticar: (requisicao) => {
        const token = tokenDoCabecalhoDeAutorizacao(
          requisicao.headers.authorization,
        );
        const segredo = process.env.JWT_SECRET?.trim();
        if (!token || !segredo) return null;

        try {
          const alegacoes = verificarTokenDeAcesso(token, segredo);
          if (alegacoes.papel !== "OWNER") return null;
          return {
            identidadeId: alegacoes.identidadeId,
            papel: "OWNER" as const,
          };
        } catch {
          return null;
        }
      },
    }),
  );

  app.use(
    "/v1/lojas",
    criarRotasDoEstoque({
      resolverLoja: identificarLoja,
      autenticar: (requisicao) => {
        const token = tokenDoCabecalhoDeAutorizacao(
          requisicao.headers.authorization,
        );
        const segredo = process.env.JWT_SECRET?.trim();
        if (!token || !segredo) return null;

        try {
          const alegacoes = verificarTokenDeAcesso(token, segredo);
          if (alegacoes.papel !== "OWNER") return null;
          return {
            identidadeId: alegacoes.identidadeId,
            papel: "OWNER" as const,
          };
        } catch {
          return null;
        }
      },
    }),
  );

  // O criador de especificações da categoria e o preenchimento delas no
  // produto (T-301): mesmo portão de autenticação do dono das rotas acima.
  app.use(
    "/v1/lojas",
    criarRotasDasEspecificacoes({
      resolverLoja: identificarLoja,
      autenticar: (requisicao) => {
        const token = tokenDoCabecalhoDeAutorizacao(
          requisicao.headers.authorization,
        );
        const segredo = process.env.JWT_SECRET?.trim();
        if (!token || !segredo) return null;

        try {
          const alegacoes = verificarTokenDeAcesso(token, segredo);
          if (alegacoes.papel !== "OWNER") return null;
          return {
            identidadeId: alegacoes.identidadeId,
            papel: "OWNER" as const,
          };
        } catch {
          return null;
        }
      },
    }),
  );

  // O CUPOM É COSTURADO AQUI (T-606): emitir a via é do módulo de impressão,
  // e interpretar a configuração de papel é do módulo da loja. A borda passa a
  // função pronta, e nenhum dos dois módulos importa o outro.
  app.use(
    "/v1/lojas",
    criarRotasDoCupom({
      resolverLoja: identificarLoja,
      lerConfiguracaoDoCupom: normalizarConfiguracaoDeImpressao,
      autenticar: (requisicao) => {
        const token = tokenDoCabecalhoDeAutorizacao(
          requisicao.headers.authorization,
        );
        const segredo = process.env.JWT_SECRET?.trim();
        if (!token || !segredo) return null;

        try {
          const alegacoes = verificarTokenDeAcesso(token, segredo);
          if (alegacoes.papel !== "OWNER") return null;
          return {
            identidadeId: alegacoes.identidadeId,
            papel: "OWNER" as const,
          };
        } catch {
          return null;
        }
      },
    }),
  );

  // A vitrine é pública por natureza: é o endereço que o cliente abre antes de
  // existir sessão, conta ou loja no contexto. Ela mesma descobre qual loja
  // atende aquele apelido.
  // A COMPOSIÇÃO ACONTECE AQUI, e não dentro do módulo: ler o horário é do
  // módulo da loja, montar a vitrine é do módulo da vitrine, e a tabela de
  // fronteiras não deixa um importar o outro. `app.ts` não pertence a camada
  // nenhuma justamente por ser a borda — é o único lugar que enxerga os dois.
  app.use(
    PREFIXO_DA_VITRINE,
    criarRotasDaVitrine({ lerHorario: horarioDaLoja, ...opcoes.vitrine }),
  );

  // O CARRINHO É COSTURADO AQUI PELO MESMO MOTIVO. Ele precisa resolver a loja
  // pelo apelido e ler o produto para recalcular o preço, e as duas coisas
  // moram no módulo da vitrine — que o módulo do carrinho não pode importar.
  // A borda passa as duas funções; nenhum dos dois módulos conhece o outro.
  app.use(
    PREFIXO_DO_CARRINHO,
    criarRotasDoCarrinho({
      identificarLoja,
      lerProduto: (produtoId) => produtoDaVitrine(produtoId),
      ...opcoes.carrinho,
    }),
  );

  // O FECHAMENTO É A COSTURA MAIS LARGA DO SISTEMA, e por isso ela mora aqui.
  // Ler o carrinho e conferir preço são do módulo `cart`; resolver a loja, o
  // horário e a configuração de entrega são de `storefront` e `stores`; criar o
  // pedido é de `orders`. Quatro módulos, e nenhum importa o outro — a borda
  // passa as funções, e é a única camada que enxerga os quatro.
  app.use(
    PREFIXO_DOS_PEDIDOS,
    criarRotasDePedidos({
      identificarLoja,
      lerCarrinho: () => verCarrinho(),
      conferirCarrinho: (carrinhoId, agora) =>
        conferirAntesDeFechar(carrinhoId, {}, agora),
      lerFechamento: async () => {
        // As formas de ENTREGA vêm da loja, e não da configuração — é a coluna
        // que o resto do sistema já usa.
        const vitrine = await lojaDaVitrine(
          new Date(),
          await horarioDaLoja(new Date()),
        );
        if (vitrine === null) return null;
        return fechamentoDaLoja(vitrine.publica.formasDeEntrega);
      },
      lerWhatsApp: () => whatsappDaLoja(),
      enderecoDoSite: process.env["URL_DO_SITE"] ?? "",
      lerAbertura: async (agora) => {
        const vitrine = await lojaDaVitrine(agora, await horarioDaLoja(agora));
        return {
          aberta: vitrine?.abertura.aberta ?? false,
          proximaAbertura: vitrine?.abertura.proximaAbertura ?? null,
        };
      },
      // O cliente logado, quando a sessão é de CLIENTE: o pedido nasce ligado
      // à conta dele e aparece no histórico (AC-616). Dono e administração não
      // compram "como conta", e convidado segue sem vínculo (ASM-103).
      autenticarCliente: (requisicao) => {
        const token = tokenDoCabecalhoDeAutorizacao(
          requisicao.headers.authorization,
        );
        const segredo = process.env.JWT_SECRET?.trim();
        if (!token || !segredo) return null;

        try {
          const alegacoes = verificarTokenDeAcesso(token, segredo);
          if (alegacoes.papel !== "CUSTOMER") return null;
          return { identidadeId: alegacoes.identidadeId };
        } catch {
          return null;
        }
      },
      ...opcoes.pedidos,
    }),
  );

  // A ÁREA DA CONTA não é de loja nenhuma: é da pessoa. O histórico dela
  // cruza lojas por um caminho dedicado (AC-616), e a sessão precisa ser de
  // CLIENTE — dono e administração não têm "meus pedidos".
  app.use(
    PREFIXO_DA_CONTA,
    criarRotasDaConta({
      autenticar: (requisicao) => {
        const token = tokenDoCabecalhoDeAutorizacao(
          requisicao.headers.authorization,
        );
        const segredo = process.env.JWT_SECRET?.trim();
        if (!token || !segredo) return null;

        try {
          const alegacoes = verificarTokenDeAcesso(token, segredo);
          if (alegacoes.papel !== "CUSTOMER") return null;
          return {
            identidadeId: alegacoes.identidadeId,
            papel: "CUSTOMER" as const,
          };
        } catch {
          return null;
        }
      },
      ...opcoes.conta,
    }),
  );

  app.get("/", (_req, res) => {
    res.json(IDENTIFICACAO_DA_API);
  });

  // Rota desconhecida responde em JSON como todo o resto da API, para que o
  // cliente não precise adivinhar o formato da resposta de erro.
  app.use((_req, res) => {
    res.status(404).json({ erro: "nao_encontrado" });
  });

  // Último de todos: o Express só entrega a falha a um middleware de quatro
  // parâmetros, e só ao que estiver depois de tudo que pode falhar (AC-024).
  app.use(manipuladorDeErros());

  return app;
}
