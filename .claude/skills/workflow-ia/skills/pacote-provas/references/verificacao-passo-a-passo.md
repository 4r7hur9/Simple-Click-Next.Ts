# Roteiro do verificador-final

Você não participou da implementação e não deve confiar em nenhum relato. Seu trabalho é tentar provar que a task **não** está pronta. Se não conseguir, ela está.

## 1. Estado e provas automáticas

```bash
.workflow-ia/wf status
.workflow-ia/wf verificar-limpo      # gate completo, diff de testes, matriz e findings a confirmar
```

- `gate.ok` falso: o julgamento será reprovado de qualquer forma. Registre os motivos e termine.
- Etapa com `status: "pulada-por-dependencia"` (`gate.puladas`, `gate.resumoPuladas`): não pegou vaga nem executou porque uma dependência (`dependeDe`) não passou. **Não está comprovada**, nunca a trate como aprovada. Nos motivos, aponte a causa raiz (`causaRaiz` da etapa, ex.: "teste-ci falhou"), não a etapa pulada.
- Etapa com `origem: "ci"` (modo CI): prova só com `ci.sha` e `ci.headSha` (o que o provedor disse que o run testou) iguais ao commit verificado e `evidencias/verificacao/ci.json` com os dois no mesmo SHA; cite a URL do run (`gate.ci.run.url`). Prova reaproveitada, anexada ou de rerun (`gate.ci.origemRun`, 0.8.0) vale igual: cite `gate.ci.runs[]` e a `tentativa`. Critério `"conteudo"` (0.9.0): app provado por dispatch verde de commit anterior com o mesmo conteúdo (`gate.ci.criterio`, `gate.ci.conteudo[]` com `app`, `sha`, `hash`): a CLI reconfere os hashes no HEAD; cite o run, o commit e os caminhos. `gate.codigo` `CI-ESTADO`/`CI-INDISPONIVEL` ou `gate.ciIndisponivel`: não é reprovação do código; nada foi provado. Repita `wf verificar-limpo` (ou use `WF_GATE_CI_FALLBACK=local`) antes de julgar.
- Anote `findingsParaConfirmar` e `matriz.semTeste`.

## 2. Critérios contra o card original

1. Leia `card.md` **antes** do `spec.md`. Liste o que o card pede.
2. Leia o `spec.md`. Todo pedido do card virou `CA-n`? Um pedido sem critério é problema novo (`verificacao/criterio-ausente`, urgente).
3. Para cada `CA-n`:
   - Abra os testes marcados com `[CA-n]`. Eles testam o que o critério diz, com asserções fortes (status, corpo, estado do banco)?
   - Abra o código que atende o critério. Ele faz isso de verdade, ou o teste passa por coincidência (mock que devolve o esperado)?
   - `atendido: true` só se as duas respostas forem sim.

## 3. Findings corrigidos

Para cada finding em `findingsParaConfirmar`, veja o campo `confirmar`:
- `correcao`: vá ao arquivo e linha e leia a correção (`git log -p` do commit indicado ajuda). O problema sumiu **e** não reapareceu em outro lugar? Então vai para `findingsConfirmados`. Não sumiu? Vai para `findingsNaoConfirmados`, com o motivo.
- `falso-positivo`: um bloqueante foi descartado com o `motivo` indicado. Leia o código e decida por conta própria. É mesmo falso positivo? `findingsConfirmados`. Não é? `findingsNaoConfirmados` com o motivo: o finding reabre.

Se `specIntegro` vier `false`, o `spec.md` mudou depois do plano: a verificação é reprovada de qualquer jeito (a Definition of Done não pode mudar durante a task).

## 4. Testes enfraquecidos

- Leia `evidencias/testes-diff.json`.
- `removidos`, `skipsAdicionados` ou `criteriosPerdidos` não vazios: reprovado.
- `menosAsserts`: abra o diff do arquivo (`git diff <baselineCommit>..HEAD -- <arquivo>`). Se a queda for legítima (casos fundidos, assert redundante), declare `"testesEnfraquecidos": false` e justifique. Senão, `true`, com novo problema `testes/enfraquecimento` (alto).

## 5. Segurança e autorização

- Há recurso com dono ou tenant no diff? Então precisa haver teste de A tentando acessar recurso de B, que recebe 403/404. Sem ele, `testesAutorizacao: "faltando"` e novo problema (urgente).
- Passe o olho no diff procurando: `req.body` direto no ORM, `$queryRawUnsafe`, `dangerouslySetInnerHTML`, `NEXT_PUBLIC_` com segredo, valor monetário vindo do cliente.

## 6. Performance

- Query nova: existe `provas-extras/explain-*.txt`? Se não, gere você mesmo (se o banco de teste estiver disponível) ou marque `faltando`, com novo problema `performance/query` (medio).
- Tela nova: há evidência de bundle? Se não se aplica, `nao-aplicavel`.

## 7. Registro

Grave `verificacao-julgamento.json` (formato na SKILL.md) e rode:

```bash
.workflow-ia/wf verificacao registrar .workflow-ia/tasks/<ID>/verificacao-julgamento.json
```

A CLI pode reprovar mesmo que você aprove: gate, commit, bloqueantes e testes são checados de novo. Isso é esperado.
