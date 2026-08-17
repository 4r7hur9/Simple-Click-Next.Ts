import type { ReactNode } from "react";
import {
  Aviso,
  Botao,
  Campo,
  Carregando,
  Cartao,
  Dialogo,
  Erro,
  Esqueleto,
  Lista,
  PALETA_CLARA,
  PALETA_ESCURA,
  Sucesso,
  TemaDaLoja,
  Vazio,
} from "@simpleclick/ui";

/**
 * Vitrine do design system: todos os componentes base, em todos os estados que
 * cada um oferece (AC-013).
 *
 * Não é documentação enfeitada — é o alvo da verificação automática de
 * acessibilidade (AC-016). Componente que só aparece aqui em um estado é
 * componente cujos outros estados ninguém nunca olhou, e é assim que "carregando"
 * vira tela branca em produção.
 *
 * A página é renderizada no servidor e não recebe nenhum manipulador de evento:
 * a interação de verdade mora nas telas do produto. Aqui o que importa é a
 * aparência e a árvore de acessibilidade de cada estado.
 */

type Pedido = { id: string; cliente: string; total: string };

const PEDIDOS: Pedido[] = [
  { id: "p-1041", cliente: "Ana", total: "R$ 48,90" },
  { id: "p-1042", cliente: "Bruno", total: "R$ 112,00" },
  { id: "p-1043", cliente: "Carla", total: "R$ 27,50" },
];

/** A lista vazia precisa do tipo: é dela que os estados de exceção partem. */
const SEM_PEDIDOS: Pedido[] = [];

/**
 * Duas cores de loja escolhidas de propósito: uma que já se lê, outra que
 * exige conserto.
 *
 * Elas vêm dos próprios valores declarados do tema, e não escritas aqui à mão —
 * a vitrine do design system é a última tela que poderia abrir exceção à regra
 * que ela existe para demonstrar (AC-014).
 */
const CORES_DE_EXEMPLO = [
  {
    cor: PALETA_CLARA.sucesso,
    nome: "Tom escuro",
    observacao: "Contraste suficiente com a letra clara: nada é alterado.",
  },
  {
    cor: PALETA_ESCURA.atencao,
    nome: "Tom claro",
    observacao:
      "Letra clara ficaria ilegível: o sistema troca a letra e escurece o tom usado como texto.",
  },
];

function Secao({
  id,
  titulo,
  descricao,
  children,
}: {
  id: string;
  titulo: string;
  descricao: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold" id={id}>
          {titulo}
        </h2>
        <p className="text-sm">{descricao}</p>
      </div>
      {children}
    </section>
  );
}

export default function VitrineDoDesignSystem() {
  return (
    <main className="sc-raiz mx-auto flex max-w-4xl flex-col gap-10 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Design system do SimpleClick</h1>
        <p>
          Cada componente base com os estados de carregando, vazio, erro e
          sucesso onde eles fazem sentido.
        </p>
      </header>

      <Secao
        descricao="Estados próprios: carregando e desabilitado. Vazio e erro pertencem a quem mostra o resultado, não ao botão."
        id="secao-botao"
        titulo="Botão"
      >
        <div className="flex flex-wrap gap-3">
          <Botao variante="primaria">Salvar</Botao>
          <Botao variante="secundaria">Cancelar</Botao>
          <Botao variante="perigo">Recusar pedido</Botao>
          <Botao variante="discreta">Ver detalhes</Botao>
          <Botao tamanho="pequeno" variante="secundaria">
            Editar
          </Botao>
        </div>
        <div className="flex flex-wrap gap-3">
          <Botao carregando rotuloDeEspera="Salvando o pedido…">
            Salvar
          </Botao>
          <Botao desabilitado variante="primaria">
            Indisponível
          </Botao>
          <Botao carregando variante="perigo">
            Recusando
          </Botao>
        </div>
      </Secao>

      <Secao
        descricao="Estados próprios: carregando (verificando no servidor), erro e sucesso. Campo sem valor é o começo normal, não um estado vazio."
        id="secao-campo"
        titulo="Campo"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            dica="Aparece no endereço da sua vitrine."
            id="campo-apelido"
            obrigatorio
            rotulo="Apelido da loja"
            defaultValue="padaria-do-ze"
          />
          <Campo
            carregando
            id="campo-apelido-verificando"
            rotulo="Apelido da loja"
            rotuloDeEspera="Verificando se o apelido está livre…"
            defaultValue="padaria-do-ze"
          />
          <Campo
            erro="Este apelido já é usado por outra loja."
            id="campo-apelido-erro"
            rotulo="Apelido da loja"
            defaultValue="padaria"
          />
          <Campo
            id="campo-apelido-sucesso"
            rotulo="Apelido da loja"
            sucesso="Apelido disponível."
            defaultValue="padaria-do-ze-2"
          />
          <Campo
            desabilitado
            dica="Só a administração altera o tipo de negócio."
            id="campo-ramo"
            rotulo="Tipo de negócio"
            defaultValue="Alimentação"
          />
        </div>
      </Secao>

      <Secao
        descricao="Os quatro estados inteiros: o cartão é a menor parte da tela que carrega dado próprio."
        id="secao-cartao"
        titulo="Cartão"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Cartao titulo="Pedidos de hoje">
            <p>12 pedidos aceitos, 3 em preparo.</p>
          </Cartao>
          <Cartao
            estado="carregando"
            rotuloDeEspera="Carregando o resumo do dia…"
            titulo="Resumo do dia"
          />
          <Cartao
            esperaComEsqueleto
            estado="carregando"
            rotuloDeEspera="Carregando o histórico…"
            titulo="Histórico"
          />
          <Cartao
            descricaoVazio="Cadastre o primeiro produto para a vitrine sair do ar vazia."
            estado="vazio"
            titulo="Catálogo"
            tituloVazio="Nenhum produto cadastrado"
          />
          <Cartao
            estado="erro"
            mensagemDeErro="Não foi possível carregar as métricas agora."
            referenciaDoErro="ref-7f3a"
            titulo="Métricas"
          />
          <Cartao
            descricaoDeSucesso="A chave PIX foi atualizada."
            estado="sucesso"
            titulo="Formas de pagamento"
            tituloDeSucesso="Configuração salva"
          />
        </div>
      </Secao>

      <Secao
        descricao="Os quatro estados. É onde eles mais importam: pedido, produto e cliente são todos listas vindas do servidor."
        id="secao-lista"
        titulo="Lista"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Lista
            chaveDoItem={(pedido) => pedido.id}
            itens={PEDIDOS}
            renderizarItem={(pedido) => (
              <span>
                {pedido.cliente} — {pedido.total}
              </span>
            )}
            rotulo="Pedidos recebidos"
          />
          <Lista
            chaveDoItem={(pedido) => pedido.id}
            estado="carregando"
            itens={SEM_PEDIDOS}
            renderizarItem={() => null}
            rotulo="Pedidos recebidos"
            rotuloDeEspera="Carregando os pedidos…"
          />
          <Lista
            chaveDoItem={(pedido) => pedido.id}
            descricaoVazio="Assim que a primeira venda entrar, ela aparece aqui."
            estado="vazio"
            itens={SEM_PEDIDOS}
            renderizarItem={() => null}
            rotulo="Pedidos recebidos"
            tituloVazio="Nenhum pedido ainda"
          />
          <Lista
            chaveDoItem={(pedido) => pedido.id}
            estado="erro"
            itens={SEM_PEDIDOS}
            mensagemDeErro="A fila de pedidos não respondeu. Tente de novo em instantes."
            referenciaDoErro="ref-2c19"
            renderizarItem={() => null}
            rotulo="Pedidos recebidos"
          />
          <Lista
            chaveDoItem={(pedido) => pedido.id}
            descricaoDeSucesso="3 pedidos novos desde a última atualização."
            estado="sucesso"
            itens={PEDIDOS}
            renderizarItem={(pedido) => (
              <span>
                {pedido.cliente} — {pedido.total}
              </span>
            )}
            rotulo="Pedidos recebidos"
            tituloDeSucesso="Lista atualizada"
          />
        </div>
      </Secao>

      <Secao
        descricao="Os quatro tons. O erro interrompe o leitor de tela; os outros esperam a próxima pausa."
        id="secao-aviso"
        titulo="Aviso"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Aviso titulo="Loja em horário reduzido" tom="info">
            Hoje o atendimento vai até as 16h.
          </Aviso>
          <Aviso titulo="Pedido aceito" tom="sucesso">
            O cliente já foi avisado pela página de acompanhamento.
          </Aviso>
          <Aviso titulo="Não foi possível imprimir" tom="erro">
            A impressora não respondeu. O cupom continua na fila.
          </Aviso>
          <Aviso titulo="Chave PIX não cadastrada" tom="atencao">
            Sem ela, o cliente não consegue concluir o pagamento.
          </Aviso>
        </div>
      </Secao>

      <Secao
        descricao="Estados próprios: carregando, erro e sucesso, para a ação que o diálogo confirma. Aqui eles aparecem embutidos, sem bloquear a página."
        id="secao-dialogo"
        titulo="Caixa de diálogo"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Dialogo
            aberto
            descricao="O cliente será avisado na página de acompanhamento."
            id="dialogo-pronto"
            modal={false}
            rodape={
              <>
                <Botao variante="secundaria">Voltar</Botao>
                <Botao variante="perigo">Recusar</Botao>
              </>
            }
            titulo="Recusar o pedido #1042?"
          >
            <p>Diga o motivo para o cliente entender a recusa.</p>
          </Dialogo>

          <Dialogo
            aberto
            estado="carregando"
            id="dialogo-carregando"
            modal={false}
            rotuloDeEspera="Recusando o pedido…"
            titulo="Recusar o pedido #1042?"
          />

          <Dialogo
            aberto
            estado="erro"
            id="dialogo-erro"
            mensagemDeErro="A recusa não foi registrada. O pedido continua em aberto."
            modal={false}
            referenciaDoErro="ref-9b04"
            titulo="Recusar o pedido #1042?"
          />

          <Dialogo
            aberto
            descricaoDeSucesso="O cliente já vê o novo status."
            estado="sucesso"
            id="dialogo-sucesso"
            modal={false}
            titulo="Recusar o pedido #1042?"
            tituloDeSucesso="Pedido recusado"
          />
        </div>
      </Secao>

      <Secao
        descricao="Os blocos reutilizáveis, fora de qualquer moldura. Toda tela nova monta os quatro a partir daqui."
        id="secao-estados"
        titulo="Estados de tela"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Carregando rotulo="Carregando o catálogo…" />
          <Esqueleto linhas={4} rotulo="Carregando a lista de produtos…" />
          <Vazio
            descricao="Nenhum pedido chegou no período escolhido."
            titulo="Sem resultados"
          />
          <Erro
            mensagem="Não foi possível falar com o servidor."
            referencia="ref-1d55"
          />
          <Sucesso
            descricao="As alterações já valem para a vitrine."
            titulo="Configuração salva"
          />
        </div>
      </Secao>

      <Secao
        descricao="A cor escolhida pelo dono é aplicada como está. O que o sistema conserta é a letra sobre ela e o tom usado como texto, quando o contraste não alcança o mínimo do WCAG."
        id="secao-tema"
        titulo="Identidade da loja"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {CORES_DE_EXEMPLO.map(({ cor, nome, observacao }) => (
            <TemaDaLoja corPrincipal={cor} key={cor}>
              <Cartao titulo={`${nome} (${cor})`}>
                <p className="text-sm">{observacao}</p>
                <div className="flex flex-wrap gap-3">
                  <Botao variante="primaria">Fazer pedido</Botao>
                  <Botao variante="discreta">Ver cardápio</Botao>
                </div>
              </Cartao>
            </TemaDaLoja>
          ))}
        </div>
      </Secao>
    </main>
  );
}
