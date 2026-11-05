# Offline-first para PDV e operações que não podem parar

Loja de moda com internet instável não pode deixar cliente na fila porque o caixa travou. Este guia cobre quando e como tornar a operação resiliente à rede.

## 1. Quando aplicar

Aplique se o card ou o critério de aceite mencionar: venda no caixa, PDV, operação offline, "internet caiu", sincronização, contingência. Para telas administrativas (relatórios, cadastro), basta tratar erro de rede com retry e mensagem clara.

## 2. Arquitetura

```
UI do caixa  ->  camada local (IndexedDB)  ->  fila de sincronização  ->  API (idempotente)
      ^                                              |
      +------------- status: online/offline/pendentes <-+
```

- **Leitura**: catálogo, preços, formas de pagamento e clientes frequentes pré-carregados e guardados localmente com carimbo de versão/data. Atualização em background quando online.
- **Escrita**: a venda é gravada primeiro no IndexedDB com `id` UUID gerado no cliente e status `pendente`. A fila envia ao servidor; sucesso marca `sincronizada`.
- **Servidor**: endpoint de venda aceita o `id` do cliente (ou `Idempotency-Key`) e trata reenvio como sucesso, sem duplicar venda nem baixar estoque duas vezes (ver `backend-engenharia`).

## 3. Service Worker

- Em Next.js, use Serwist (`@serwist/next`) ou Workbox; não escreva o SW do zero sem motivo.
- Pré-cache do shell da rota do PDV e dos assets estáticos.
- Estratégias: `NetworkFirst` para dados do catálogo com fallback ao cache; `CacheFirst` para imagens de produto; nunca cachear respostas de autenticação ou de outro tenant.
- Versione o cache e limpe versões antigas no `activate`.
- Atualização do SW: avise o operador ("Nova versão disponível") e aplique entre vendas, nunca no meio de uma.

## 4. IndexedDB

- Use uma lib madura (`idb` ou Dexie) em vez da API crua.
- Stores sugeridos: `produtos` (indexado por código de barras e SKU), `vendasPendentes`, `metadados` (versão do catálogo, último sync).
- Chame `navigator.storage.persist()` para reduzir o risco de o navegador apagar dados por pressão de espaço.
- Dados sensíveis: não guarde token de sessão, dados completos de cartão ou CPF de clientes sem necessidade. Guarde o mínimo para concluir a venda (ver `frontend-seguranca`).
- Isole por tenant e por usuário: a chave do banco local inclui o tenant; no logout, limpe.

## 5. Sincronização

```ts
async function sincronizarPendentes(db: DbLocal) {
  const pendentes = await db.getAll('vendasPendentes');
  for (const venda of pendentes) {
    try {
      const res = await fetch('/api/vendas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': venda.id },
        body: JSON.stringify(venda),
      });
      if (res.ok) {
        await db.delete('vendasPendentes', venda.id); // chave repetida devolve a resposta original
      } else if (res.status === 409) {
        // mesma Idempotency-Key ainda em processamento: mantém na fila e tenta depois
      } else if (res.status >= 400 && res.status < 500) {
        await db.put('vendasComErro', { ...venda, erro: res.status }); // precisa de ação humana
        await db.delete('vendasPendentes', venda.id);
      }
      // 5xx: mantém na fila para próxima tentativa
    } catch {
      break; // sem rede: tenta depois
    }
  }
}
```

- Dispare no evento `online`, ao abrir o app e em intervalo com backoff. Background Sync API tem suporte limitado; não dependa só dela.
- Envie em ordem (FIFO) e uma de cada vez, ou em lote se o endpoint suportar lote idempotente.
- Conflitos (estoque ficou negativo, preço mudou): o servidor decide e registra; a UI mostra vendas com pendência para o gerente resolver. Preço da venda offline é o snapshot do momento da venda.

## 6. UX do modo offline

- Indicador permanente e discreto: "Offline: 3 vendas aguardando envio".
- Não bloqueie a venda; bloqueie apenas o que exige servidor (ex.: pagamento com cartão online, consulta de crédito) com mensagem clara.
- Ao voltar online: "3 vendas sincronizadas".
- Vendas com erro de sincronização aparecem em lista visível, nunca somem.

## 7. Testes

- Playwright: `context.setOffline(true)`, realizar venda, verificar item pendente; `setOffline(false)`, verificar sincronização e que a API recebeu uma única venda.
- Teste de reenvio: enviar a mesma venda duas vezes e verificar que o servidor registra uma.
- Teste de atualização do catálogo com versão antiga em cache.

## 8. Checklist do revisor

- Venda offline tem id gerado no cliente e o servidor é idempotente? (sem isso: urgente, risco de venda duplicada)
- Existe indicação visual de offline e pendências? (alto)
- Dados de outro tenant/usuário podem ficar no dispositivo após logout? (alto)
- Service Worker cacheia respostas autenticadas genéricas? (urgente se servir dado de outro usuário)
- Erro 4xx de sincronização é descartado silenciosamente? (alto)
