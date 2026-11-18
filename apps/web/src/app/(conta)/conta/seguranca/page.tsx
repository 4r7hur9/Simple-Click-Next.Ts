import {
  Aviso,
  Botao,
  Cartao,
  IconeAlerta,
  IconeConfirmar,
  IconeExcluir,
  IconeMenu,
  IconeSeguranca,
  IconeSair,
} from "@simpleclick/ui";

import { PaginaDaConta } from "../../../../features/conta/PaginaDaConta.tsx";
import {
  DesativarAplicativo,
  ExcluirConta,
  SessoesAbertas,
  TrocarSenha,
} from "../../../../features/conta/SegurancaDaConta.tsx";
import {
  ExportarMeusDados,
  HistoricoDeConsentimentos,
} from "../../../../features/conta/PrivacidadeDaConta.tsx";
import { buscarAceites, buscarDadosDaConta, buscarSessoesAbertas } from "../../../../lib/conta-do-cliente.ts";
import { tokenOuEntrar } from "../_token.ts";

import { sairDepoisDeExcluirAConta } from "../../../../server/actions/conta.ts";
import {
  encerrarTodasAsSessoes,
  sairDaConta,
} from "../../../../server/actions/auth.ts";

export const metadata = {
  title: "Segurança da conta | SimpleClick",
};

// Mostra a pessoa da sessão: nada aqui pode ser guardado de antemão (AC-11120).
export const dynamic = "force-dynamic";

/**
 * Ações separadas para a pessoa não encerrar todos os dispositivos por engano.
 * Formulários funcionam sem JavaScript e enviam a ação ao servidor, que nunca
 * expõe o cookie de renovação ao código do navegador (P-008).
 */
export default async function PaginaDeSeguranca({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado } = await searchParams;
  const token = await tokenOuEntrar("/conta/seguranca");
  const [dados, sessoes, aceites] = await Promise.all([
    buscarDadosDaConta(token),
    buscarSessoesAbertas(token),
    buscarAceites(token),
  ]);
  const comAplicativo = dados.estado === "ok" && dados.dados.aplicativoAutenticador;
  return (
    <PaginaDaConta
      atual="seguranca"
      titulo="Segurança"
      descricao="Senha, aparelhos conectados, verificação em duas etapas, privacidade e exclusão da conta."
    >
      {estado === "erro" ? (
        <Aviso tom="erro">
          Não foi possível encerrar a sessão. Tente novamente.
        </Aviso>
      ) : null}

      <div className="sc-minha-conta__blocos">
        <Cartao
          nivelDoTitulo={2}
          icone={<IconeSeguranca />}
          titulo="Trocar senha"
          descricao="Ao trocar, os outros aparelhos saem da conta em até 15 minutos (o tempo de a conexão deles ser renovada). Use 12 caracteres ou mais."
        >
          <TrocarSenha />
        </Cartao>

        <Cartao
          nivelDoTitulo={2}
          icone={<IconeConfirmar />}
          titulo="Verificação em duas etapas"
          descricao={
            comAplicativo
              ? "Ativa: entrar pede também o código do aplicativo autenticador."
              : "Opcional para clientes. Com o aplicativo autenticador, entrar pede também o código do seu celular."
          }
        >
          {comAplicativo ? (
            <DesativarAplicativo />
          ) : (
            <p className="sc-minha-conta__acao">
              <a className="sc-botao sc-botao--secundaria" href="/conta/seguranca/aplicativo">
                Configurar aplicativo autenticador
              </a>
            </p>
          )}
        </Cartao>

        <Cartao
          nivelDoTitulo={2}
          icone={<IconeMenu />}
          titulo="Aparelhos conectados"
          descricao="Onde sua conta está aberta agora. Encerre os que você não reconhece."
        >
          {sessoes.estado === "ok" ? (
            <SessoesAbertas inicial={sessoes.dados} />
          ) : (
            <Aviso tom="erro">Não deu para listar as conexões agora.</Aviso>
          )}
        </Cartao>

        <Cartao
          nivelDoTitulo={2}
          icone={<IconeSair />}
          titulo="Sair deste dispositivo"
          descricao="Encerra somente a sessão usada neste navegador."
        >
          <form action={sairDaConta} className="sc-minha-conta__acao">
            <Botao type="submit" variante="secundaria" icone={<IconeSair />}>
              Sair
            </Botao>
          </form>
        </Cartao>

        <Cartao
          nivelDoTitulo={2}
          icone={<IconeAlerta />}
          titulo="Encerrar todas as sessões"
          descricao="Desconecta sua conta de todos os dispositivos. Para voltar, será preciso entrar novamente em cada um deles."
        >
          <form
            action={encerrarTodasAsSessoes}
            className="sc-minha-conta__acao"
          >
            <Botao type="submit" variante="perigo">
              Encerrar todas as sessões
            </Botao>
          </form>
        </Cartao>

        <Cartao
          nivelDoTitulo={2}
          icone={<IconeConfirmar />}
          titulo="Privacidade: seus aceites e cookies"
          descricao="Os documentos que você aceitou, com versão e data, e as suas escolhas de cookies."
        >
          {aceites.estado === "ok" ? (
            <HistoricoDeConsentimentos situacao={aceites.dados} />
          ) : (
            <Aviso tom="erro">Não deu para listar os seus aceites agora.</Aviso>
          )}
        </Cartao>

        <Cartao
          nivelDoTitulo={2}
          icone={<IconeMenu />}
          titulo="Baixar meus dados"
          descricao="Um arquivo com tudo o que guardamos sobre você: cadastro, endereços, pedidos, favoritos e aceites."
        >
          <ExportarMeusDados />
        </Cartao>

        <p className="sc-seguranca__risco" role="presentation">
          Zona de risco
        </p>
        <Cartao
          nivelDoTitulo={2}
          icone={<IconeExcluir />}
          titulo="Excluir minha conta"
          descricao="Apaga seus dados pessoais e desconecta todos os aparelhos. Não dá para desfazer."
        >
          <ExcluirConta sairDepois={sairDepoisDeExcluirAConta} />
        </Cartao>
      </div>
    </PaginaDaConta>
  );
}
