"use client";

/**
 * Meus endereços: cadastrar uma vez e usar em qualquer loja (T-707, AC-509).
 *
 * O PADRÃO É O QUE O FECHAMENTO PREENCHE. A tela diz isso com todas as letras
 * ao lado do endereço padrão, e trocar o padrão é um toque. Apagar pede
 * confirmação na própria tela — sem janela do navegador.
 *
 * Quatro estados: carregando, erro com "tentar de novo", vazio com o convite
 * a cadastrar, e a lista.
 */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Aviso,
  Botao,
  Campo,
  Carregando,
  Erro,
  IconeAdicionar,
  IconeEditar,
  IconeExcluir,
  Selo,
  Vazio,
} from "@simpleclick/ui";

import {
  apagarEnderecoDaConta,
  enderecoEmUmaLinha,
  listarEnderecosSalvos,
  paraSalvar,
  salvarEnderecoDaConta,
  trocarEnderecoDaConta,
  type EnderecoSalvo,
} from "../../lib/enderecos-da-conta.ts";

type Estado =
  | { readonly tipo: "carregando" }
  | { readonly tipo: "erro" }
  | { readonly tipo: "ok"; readonly enderecos: readonly EnderecoSalvo[] };

export interface EnderecosSalvosProps {
  /** A rede. A prova troca por uma que responde sem servidor. */
  readonly buscar?: typeof fetch | undefined;
}

const APELIDOS_RAPIDOS = ["Casa", "Trabalho"] as const;

function NovoEndereco({
  aoSalvar,
  buscar,
  editando,
}: {
  readonly aoSalvar: () => void;
  readonly buscar: typeof fetch;
  /** Preenchido, o formulário troca esse endereço em vez de criar outro. */
  readonly editando?: EnderecoSalvo | undefined;
}) {
  const [rotulo, setRotulo] = useState(editando?.rotulo ?? "");
  const [logradouro, setLogradouro] = useState(editando?.logradouro ?? "");
  const [numero, setNumero] = useState(editando?.numero ?? "");
  const [complemento, setComplemento] = useState(editando?.complemento ?? "");
  const [bairro, setBairro] = useState(editando?.bairro ?? "");
  const [cidade, setCidade] = useState(editando?.cidade ?? "");
  const [estado, setEstado] = useState(editando?.estado ?? "");
  const [cep, setCep] = useState(editando?.cep ?? "");
  const [referencia, setReferencia] = useState(
    editando?.pontoDeReferencia ?? "",
  );
  const [padrao, setPadrao] = useState(editando?.padrao ?? false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (logradouro.trim().length < 3) {
      setErro("Informe a rua do endereço.");
      return;
    }
    setErro(null);
    setEnviando(true);
    const corpo = {
        rotulo: rotulo.trim() || null,
        logradouro: logradouro.trim(),
        numero: numero.trim() || null,
        complemento: complemento.trim() || null,
        bairro: bairro.trim() || null,
        cidade: cidade.trim() || null,
        estado: estado.trim().toUpperCase() || null,
        cep: cep.trim() || null,
        pontoDeReferencia: referencia.trim() || null,
        padrao,
      };
    const resultado =
      editando === undefined
        ? await salvarEnderecoDaConta(corpo, buscar)
        : await trocarEnderecoDaConta(
            editando.id,
            { ...paraSalvar(editando, padrao), ...corpo },
            buscar,
          );
    setEnviando(false);
    if (resultado.estado === "salvo") aoSalvar();
    else setErro("Não foi possível salvar. Confira os campos e tente de novo.");
  }

  return (
    <form
      aria-label="Novo endereço"
      className="sc-enderecos__novo"
      noValidate
      onSubmit={(evento) => void enviar(evento)}
    >
      <div className="sc-enderecos__apelidos" role="group" aria-label="Apelido rápido">
        {APELIDOS_RAPIDOS.map((apelido) => (
          <button
            key={apelido}
            type="button"
            className="sc-enderecos__apelido"
            aria-pressed={rotulo === apelido}
            onClick={() => setRotulo(apelido)}
          >
            {apelido}
          </button>
        ))}
      </div>
      <Campo
        id="endereco-rotulo"
        rotulo="Nome do endereço (opcional)"
        dica="Só para você reconhecer na lista. Ex.: Casa, Trabalho, casa da mãe."
        value={rotulo}
        onChange={(e) => setRotulo(e.target.value)}
      />
      <Campo
        id="endereco-logradouro"
        rotulo="Rua ou avenida"
        placeholder="Ex.: Rua das Flores"
        autoComplete="address-line1"
        obrigatorio
        value={logradouro}
        onChange={(e) => setLogradouro(e.target.value)}
        erro={erro ?? undefined}
      />
      <div className="sc-enderecos__grade">
        <Campo
          id="endereco-numero"
          rotulo="Número"
          placeholder="Ex.: 123"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
        />
        <Campo
          id="endereco-complemento"
          rotulo="Complemento (opcional)"
          placeholder="Ex.: apto 302, bloco B"
          autoComplete="address-line2"
          value={complemento}
          onChange={(e) => setComplemento(e.target.value)}
        />
        <Campo
          id="endereco-bairro"
          rotulo="Bairro"
          dica="A loja usa o bairro para calcular a entrega."
          value={bairro}
          onChange={(e) => setBairro(e.target.value)}
        />
        <Campo
          id="endereco-cidade"
          rotulo="Cidade"
          autoComplete="address-level2"
          value={cidade}
          onChange={(e) => setCidade(e.target.value)}
        />
        <Campo
          id="endereco-estado"
          rotulo="Estado (UF)"
          placeholder="Ex.: CE"
          maxLength={2}
          autoComplete="address-level1"
          value={estado}
          onChange={(e) => setEstado(e.target.value.toUpperCase())}
        />
        <Campo
          id="endereco-cep"
          rotulo="CEP (opcional)"
          placeholder="Ex.: 60000-000"
          inputMode="numeric"
          autoComplete="postal-code"
          value={cep}
          onChange={(e) => setCep(e.target.value)}
        />
      </div>
      <Campo
        id="endereco-referencia"
        rotulo="Ponto de referência (opcional)"
        dica="Algo perto que ajude quem entrega a achar. Ex.: em frente à padaria, portão azul."
        value={referencia}
        onChange={(e) => setReferencia(e.target.value)}
      />
      <label className="sc-enderecos__marcar">
        <input
          type="checkbox"
          checked={padrao}
          onChange={(e) => setPadrao(e.target.checked)}
        />
        Usar como endereço padrão nos pedidos
      </label>
      <div>
        <Botao type="submit" carregando={enviando} rotuloDeEspera="Salvando…">
          {editando === undefined ? "Salvar endereço" : "Salvar alterações"}
        </Botao>
      </div>
    </form>
  );
}

export function EnderecosSalvos({ buscar = fetch }: EnderecosSalvosProps) {
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [adicionando, setAdicionando] = useState(false);
  const [apagando, setApagando] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);
  /** O endereço com uma ação em andamento: sem clique duplo (AC-11130). */
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setEstado({ tipo: "carregando" });
    const leitura = await listarEnderecosSalvos(buscar);
    setEstado(
      leitura.estado === "ok"
        ? { tipo: "ok", enderecos: leitura.enderecos }
        : { tipo: "erro" },
    );
  }, [buscar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function tornarPadrao(endereco: EnderecoSalvo) {
    if (ocupado !== null) return;
    setFalhou(false);
    setOcupado(endereco.id);
    const resultado = await trocarEnderecoDaConta(
      endereco.id,
      paraSalvar(endereco, true),
      buscar,
    );
    setOcupado(null);
    if (resultado.estado === "salvo") await carregar();
    else setFalhou(true);
  }

  async function apagar(id: string) {
    if (ocupado !== null) return;
    setFalhou(false);
    setOcupado(id);
    const apagado = await apagarEnderecoDaConta(id, buscar);
    setOcupado(null);
    setApagando(null);
    if (apagado) await carregar();
    else setFalhou(true);
  }

  if (estado.tipo === "carregando") {
    return <Carregando rotulo="Carregando seus endereços…" />;
  }
  if (estado.tipo === "erro") {
    return (
      <Erro
        titulo="Não foi possível carregar seus endereços"
        mensagem="Confira a conexão e tente de novo."
        acao={
          <Botao variante="secundaria" onClick={() => void carregar()}>
            Tentar de novo
          </Botao>
        }
      />
    );
  }

  const formulario = adicionando ? (
    <NovoEndereco
      buscar={buscar}
      aoSalvar={() => {
        setAdicionando(false);
        void carregar();
      }}
    />
  ) : (
    <div>
      <Botao icone={<IconeAdicionar />} onClick={() => setAdicionando(true)}>
        Cadastrar endereço
      </Botao>
    </div>
  );

  return (
    <div className="sc-enderecos">
      {falhou ? (
        <Aviso tom="erro">
          Não foi possível concluir agora. Tente de novo.
        </Aviso>
      ) : null}
      {estado.enderecos.length === 0 ? (
        <Vazio
          titulo="Nenhum endereço salvo"
          descricao="Cadastre uma vez e ele vem preenchido no fechamento de qualquer loja."
        />
      ) : (
        <ul className="sc-enderecos__lista" aria-label="Endereços salvos">
          {estado.enderecos.map((endereco) => (
            <li
              key={endereco.id}
              className={
                endereco.padrao
                  ? "sc-endereco sc-endereco--padrao"
                  : "sc-endereco"
              }
              data-endereco={endereco.id}
            >
              {editando === endereco.id ? (
                <NovoEndereco
                  buscar={buscar}
                  editando={endereco}
                  aoSalvar={() => {
                    setEditando(null);
                    void carregar();
                  }}
                />
              ) : null}
              <p className="sc-endereco__nome" hidden={editando === endereco.id}>
                {endereco.rotulo ?? "Endereço"}
                {endereco.padrao ? (
                  <Selo tom="sucesso">Padrão — vem preenchido nos pedidos</Selo>
                ) : null}
              </p>
              <p className="sc-endereco__linha" hidden={editando === endereco.id}>
                {enderecoEmUmaLinha(endereco)}
              </p>
              <div className="sc-endereco__acoes" hidden={editando === endereco.id}>
                <Botao
                  variante="secundaria"
                  tamanho="pequeno"
                  icone={<IconeEditar />}
                  onClick={() => setEditando(endereco.id)}
                >
                  Editar
                </Botao>
                {endereco.padrao ? null : (
                  <Botao
                    variante="secundaria"
                    tamanho="pequeno"
                    carregando={ocupado === endereco.id}
                    rotuloDeEspera="Salvando…"
                    desabilitado={ocupado !== null}
                    onClick={() => void tornarPadrao(endereco)}
                  >
                    Usar como padrão
                  </Botao>
                )}
                {apagando === endereco.id ? (
                  <>
                    {endereco.padrao && estado.enderecos.length > 1 ? (
                      <p className="sc-endereco__linha" role="note">
                        Este é o endereço padrão. Se você apagar, o mais antigo
                        que sobrar passa a ser o padrão.
                      </p>
                    ) : null}
                    <Botao
                      variante="perigo"
                      tamanho="pequeno"
                      carregando={ocupado === endereco.id}
                      rotuloDeEspera="Apagando…"
                      desabilitado={ocupado !== null}
                      onClick={() => void apagar(endereco.id)}
                    >
                      Sim, apagar
                    </Botao>
                    <Botao
                      variante="discreta"
                      tamanho="pequeno"
                      onClick={() => setApagando(null)}
                    >
                      Não apagar
                    </Botao>
                  </>
                ) : (
                  <Botao
                    variante="discreta"
                    tamanho="pequeno"
                    icone={<IconeExcluir />}
                    onClick={() => setApagando(endereco.id)}
                  >
                    Apagar
                  </Botao>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {formulario}
    </div>
  );
}
