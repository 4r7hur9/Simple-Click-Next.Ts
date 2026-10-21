// As peças lado a lado nos temas claro e escuro, cada lado com `data-tema`
// próprio: é onde se confere de uma vez que nada some no escuro.
import {
  Aviso,
  Botao,
  Campo,
  CampoDeSenha,
  Cartao,
  Dialogo,
  IconeAdicionar,
  IconeEditar,
  IconeExcluir,
  IconeLoja,
  MenuSuspenso,
  Sanfona,
  Selo,
} from "@simpleclick/ui";

import { Secao } from "./SecaoDaVitrine.tsx";
import { TabelaDeExemplo } from "./TabelaDeExemplo.tsx";

const TEMAS = [
  { tema: "claro", nome: "Tema claro" },
  { tema: "escuro", nome: "Tema escuro" },
] as const;

/** Todas as peças num tema; o prefixo mantém os `id` únicos na página. */
function Mostruario({ prefixo, nome }: { prefixo: string; nome: string }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        <Botao forma="pilula" icone={<IconeAdicionar />}>
          Fazer pedido
        </Botao>
        <Botao variante="secundaria">Cancelar</Botao>
        <Botao variante="perigo">Recusar</Botao>
        <Botao variante="discreta">Detalhes</Botao>
        <Botao icone={<IconeEditar />} soIcone variante="secundaria">
          Editar
        </Botao>
        <Botao desabilitado>Indisponível</Botao>
      </div>

      <div className="flex flex-wrap gap-2">
        <Selo tom="sucesso">Pago</Selo>
        <Selo tom="atencao">Em preparo</Selo>
        <Selo tom="erro">Recusado</Selo>
        <Selo tom="info">Novo</Selo>
        <Selo>Rascunho</Selo>
      </div>

      <div className="grid gap-3">
        <Campo
          dica="Aparece no endereço da vitrine."
          id={`${prefixo}-apelido`}
          rotulo="Apelido da loja"
          defaultValue="padaria-do-ze"
        />
        <Campo
          erro="Este apelido já é usado."
          id={`${prefixo}-apelido-erro`}
          rotulo="Apelido da loja"
          defaultValue="padaria"
        />
        <CampoDeSenha
          defaultValue="Abcdefg1"
          id={`${prefixo}-senha`}
          mostrarForca
          rotulo="Senha nova"
        />
      </div>

      <Cartao
        acoes={
          <Botao
            icone={<IconeExcluir />}
            soIcone
            tamanho="pequeno"
            variante="discreta"
          >
            Excluir loja
          </Botao>
        }
        descricao="Rua das Flores, 12 — Centro"
        icone={<IconeLoja />}
        nivelDoTitulo={4}
        rodape={
          <>
            <Selo tom="sucesso">Aberta</Selo>
            <Botao tamanho="pequeno" variante="secundaria">
              Ver vitrine
            </Botao>
          </>
        }
        titulo="Padaria do Zé"
      >
        <p className="text-sm">12 pedidos hoje, 3 em preparo.</p>
      </Cartao>

      <div>
        <Sanfona abertaInicialmente titulo="Como recebo o pagamento?">
          Pelo PIX da loja ou em dinheiro na entrega.
        </Sanfona>
        <Sanfona titulo="Posso pausar a loja?">
          Sim, trocando o horário para fechado.
        </Sanfona>
      </div>

      <MenuSuspenso
        id={`${prefixo}-menu`}
        itens={[
          { href: "/conta", id: "perfil", rotulo: "Meu perfil" },
          { href: "/sair", id: "sair", perigo: true, rotulo: "Sair" },
        ]}
        rotulo="Minha conta"
      />

      <TabelaDeExemplo legenda={`Pedidos — ${nome}`} noCelular="cartoes" />

      <Aviso aoVivo={false} titulo="Chave PIX não cadastrada" tom="atencao">
        Sem ela, o cliente não conclui o pagamento.
      </Aviso>

      <Dialogo
        aberto
        descricao="O cliente será avisado."
        id={`${prefixo}-dialogo`}
        modal={false}
        rodape={
          <>
            <Botao variante="secundaria">Voltar</Botao>
            <Botao variante="perigo">Recusar</Botao>
          </>
        }
        titulo="Recusar o pedido #1042?"
      />
    </div>
  );
}

/** As peças em dois painéis, um por tema. */
export function SecaoDosTemas() {
  return (
    <Secao
      descricao="Cada painel fixa o próprio tema com data-tema, qualquer que seja o do sistema."
      id="secao-temas"
      titulo="Claro e escuro, lado a lado"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {TEMAS.map(({ tema, nome }) => (
          <div
            className="sc-raiz flex min-w-0 flex-col gap-4 rounded-[var(--raio-janela)] border border-borda p-5"
            data-tema={tema}
            key={tema}
          >
            <h3 className="font-display text-lg font-semibold">{nome}</h3>
            <Mostruario nome={nome} prefixo={`tema-${tema}`} />
          </div>
        ))}
      </div>
    </Secao>
  );
}
