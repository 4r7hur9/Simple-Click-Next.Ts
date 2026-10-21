"use client";

/**
 * Tela de criar conta (AC-100 a AC-102, T-113; card #28).
 *
 * Primeiro a pessoa diz o que quer: comprar (conta de cliente, sem confirmar
 * e-mail) ou vender (conta de dono com o cadastro da loja, que fica em
 * análise até a administração aprovar). O tipo vai no endereço
 * (`?tipo=cliente|dono`), junto de `?proximo=` — conferido contra endereço de
 * fora.
 */
import "@simpleclick/ui/styles/cadastro.css";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { CadastroDeDono } from "../../../features/auth/CadastroDeDono.tsx";
import { CadastroForm } from "../../../features/auth/CadastroForm.tsx";
import { AoContinuarVoceConcorda } from "../../../features/legal/RodapeLegal.tsx";
import { CascaDaConta } from "../../../features/auth/CascaDaConta.tsx";
import { SeletorDeTipoDeConta } from "../../../features/auth/SeletorDeTipoDeConta.tsx";
import { enviarCadastro } from "../../../features/auth/acesso-na-ponte.ts";
import {
  comDestino,
  destinoDosParametros,
} from "../../../features/auth/destino-seguro.ts";

function ConteudoDoCadastro() {
  const roteador = useRouter();
  const parametros = useSearchParams();
  const destino =
    parametros === null ? undefined : destinoDosParametros(parametros);
  const tipo = parametros?.get("tipo");
  const entrar = comDestino("/entrar", destino);
  const doTipo = (valor: "cliente" | "dono") =>
    comDestino(`/cadastrar?tipo=${valor}`, destino);

  if (tipo === "dono") {
    return (
      <CascaDaConta
        identificadorDoTitulo="cadastro-titulo"
        titulo="Cadastre sua loja"
        descricao="Duas etapas curtas. Depois a equipe do SimpleClick analisa e libera a sua loja."
        etiqueta="Para lojistas"
        painel="lojista"
      >
        <CadastroDeDono
          aoConcluir={(paraOPainel) => roteador.replace(paraOPainel)}
          linkParaEntrar={<a href={entrar}>Entrar</a>}
        />
        <AoContinuarVoceConcorda />
        <p className="sc-conta__rodape-formulario">
          Já tem conta? <a href={entrar}>Entrar</a> ·{" "}
          <a href={doTipo("cliente")}>Só quero comprar</a>
        </p>
      </CascaDaConta>
    );
  }

  if (tipo === "cliente") {
    return (
      <CascaDaConta
        identificadorDoTitulo="cadastro-titulo"
        titulo="Criar conta"
        descricao="Leva um minuto. Com a conta, você pede, acompanha seus pedidos e não digita seus dados de novo."
      >
        <CadastroForm
          aoCadastrar={enviarCadastro}
          aoCriarConta={(paraOPapel) => roteador.replace(destino ?? paraOPapel)}
          linkParaEntrar={<a href={entrar}>Entrar</a>}
        />
        <AoContinuarVoceConcorda />
        <p className="sc-conta__rodape-formulario">
          Já tem conta? <a href={entrar}>Entrar</a> ·{" "}
          <a href={doTipo("dono")}>Quero vender</a>
        </p>
      </CascaDaConta>
    );
  }

  return (
    <CascaDaConta
      identificadorDoTitulo="cadastro-titulo"
      titulo="Criar conta"
      descricao="Como você quer usar o SimpleClick?"
    >
      <SeletorDeTipoDeConta
        enderecoDoCliente={doTipo("cliente")}
        enderecoDoDono={doTipo("dono")}
      />
      <p className="sc-conta__rodape-formulario">
        Já tem conta? <a href={entrar}>Entrar</a>
      </p>
    </CascaDaConta>
  );
}

export default function PaginaDeCadastro() {
  return (
    <Suspense fallback={null}>
      <ConteudoDoCadastro />
    </Suspense>
  );
}
