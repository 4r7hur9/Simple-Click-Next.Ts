# Resumo do k6 — carga (perfil completo, rodada b7166227)

**Thresholds do k6:** APROVADO · duração medida 493.2 s

## Por operação

| operação | requisições | req/s | p50 | p90 | p95 | p99 | máx | falhas HTTP |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| cadastro | 20 | 0.04 | 116 ms | 132 ms | 134 ms | 143 ms | 145 ms | 0.00% |
| vitrine | 2963 | 6.01 | 7 ms | 15 ms | 18 ms | 23 ms | 45 ms | 0.00% |
| pagina | 720 | 1.46 | 18 ms | 33 ms | 48 ms | 60 ms | 92 ms | 0.00% |
| catalogo | 4740 | 9.61 | 9 ms | 17 ms | 23 ms | 30 ms | 83 ms | 0.00% |
| produto | 1521 | 3.08 | 11 ms | 19 ms | 24 ms | 33 ms | 50 ms | 0.00% |
| imagem | 7110 | 14.42 | 1 ms | 2 ms | 2 ms | 4 ms | 29 ms | 0.00% |
| fechamento | 593 | 1.20 | 6 ms | 12 ms | 13 ms | 18 ms | 26 ms | 0.00% |
| carrinho | 593 | 1.20 | 13 ms | 19 ms | 24 ms | 33 ms | 67 ms | 0.00% |
| conferencia | 593 | 1.20 | 7 ms | 10 ms | 12 ms | 17 ms | 41 ms | 0.00% |
| criar | 593 | 1.20 | 24 ms | 36 ms | 41 ms | 66 ms | 138 ms | 0.00% |
| replay | 593 | 1.20 | 13 ms | 19 ms | 21 ms | 31 ms | 49 ms | 0.00% |
| consulta | 593 | 1.20 | 6 ms | 8 ms | 9 ms | 12 ms | 18 ms | 0.00% |
| login | 22 | 0.04 | 85 ms | 141 ms | 148 ms | 149 ms | 149 ms | 0.00% |
| meus_pedidos | 1501 | 3.04 | 273 ms | 360 ms | 374 ms | 407 ms | 564 ms | 0.00% |
| fila | 120 | 0.24 | 8 ms | 12 ms | 13 ms | 15 ms | 17 ms | 0.00% |
| fila_cruzada | 2 | 0.00 | 5 ms | 6 ms | 6 ms | 6 ms | 6 ms | 0.00% |
| preparo | 670 | 1.36 | 11 ms | 26 ms | 31 ms | 107 ms | 123 ms | 0.00% |

## Classificação (o que o k6 viu)

| classe | quantidade | detalhe |
|---|---:|---|
| Lentidão | 0 | metas de p95 respeitadas |
| Recusa de negócio prevista | 0 | loja fechada 0, mínimo do pedido 0 |
| Falha de infraestrutura | 0 | tempo esgotado/sem resposta 0, 429 0, 5xx 0 |
| Rejeição inesperada (4xx fora do previsto) | 0 | 403, 401, 404, 400, 409/422 sem explicação |
| Total incorreto | 0 | total ≠ subtotal + taxa, ou consulta ≠ criação |
| Replay divergente (sinal) | 0 | replay ≠ 200 ou com outro pedido; o veredito de duplicidade é do banco |
| Falhas inesperadas (taxa) | 0.00% | critério dos thresholds de falha |

## Compras

- compras criadas (201): **593**
- replays corretos (200, mesmo pedido e total): **593**
- criações incertas (tempo esgotado ou 5xx): **0**; recuperadas pelo replay: 0
- 500 no replay: 0

## Cobertura: 100 de 100 lojas receberam tráfego

## Vazão, validade e metas

- vazão: **46.53 req/s** (22948 requisições), 9.29 iterações/s; compras 593 + 200 do preparo
- execução válida (integridade, isolamento, trabalho fixo): **SIM**
- metas de p95/p99: **atingidas**
- cenário conta: 1501 chamadas, 0 descartadas; linhas por chamada 20–20 (mediana 20)
- janela de controle (2 min iniciais, sem conta/painel): p95 catálogo 28 ms, criação 52 ms; depois: catálogo 17 ms, criação 38 ms

## Thresholds

| métrica | expressão | resultado |
|---|---|---|
| lojas_visitadas{loja:construcao-de-farias-brito} | count>0 | ok |
| lojas_visitadas{loja:tabacaria-de-henrique-jorge} | count>0 | ok |
| replay_divergente | count==0 | ok |
| lojas_visitadas{loja:bazar-de-rodolfo-teofilo} | count>0 | ok |
| lojas_visitadas{loja:perfumaria-de-vicente-pinzon} | count>0 | ok |
| lojas_visitadas{loja:restaurante-da-barra-do-ceara} | count>0 | ok |
| lojas_visitadas{loja:adega-da-aldeota} | count>0 | ok |
| http_req_duration{op:fila,expected_response:true} | p(95)<500 | ok |
| erro500_replay | count==0 | ok |
| http_req_duration{op:meus_pedidos,expected_response:true} | p(95)<500 | ok |
| lojas_visitadas{loja:restaurante-de-coacu} | count>0 | ok |
| lojas_visitadas{loja:tabacaria-do-pici} | count>0 | ok |
| lojas_visitadas{loja:restaurante-de-couto-fernandes} | count>0 | ok |
| lojas_visitadas{loja:papelaria-de-democrito-rocha} | count>0 | ok |
| lojas_visitadas{loja:acaiteria-de-manuel-dias-branco} | count>0 | ok |
| http_req_duration{op:replay,expected_response:true} | p(95)<500 | ok |
| lojas_visitadas{loja:bazar-de-maraponga} | count>0 | ok |
| checks | rate>0.99 | ok |
| lojas_visitadas{loja:autopecas-do-parque-iracema} | count>0 | ok |
| lojas_visitadas{loja:calcados-de-parangaba} | count>0 | ok |
| lojas_visitadas{loja:adega-de-jacarecanga} | count>0 | ok |
| lojas_visitadas{loja:hamburgueria-do-alto-da-balanca} | count>0 | ok |
| lojas_visitadas{loja:adega-da-lagoa-redonda} | count>0 | ok |
| lojas_visitadas{loja:tabacaria-do-mondubim} | count>0 | ok |
| lojas_visitadas{loja:floricultura-do-itaperi} | count>0 | ok |
| lojas_visitadas{loja:moda-do-centro} | count>0 | ok |
| vazamento_painel | count==0 | ok |
| lojas_visitadas{loja:autopecas-da-floresta} | count>0 | ok |
| lojas_visitadas{loja:hamburgueria-de-antonio-bezerra} | count>0 | ok |
| lojas_visitadas{loja:pizzaria-da-vila-velha} | count>0 | ok |
| lojas_visitadas{loja:farmacia-da-vila-uniao} | count>0 | ok |
| lojas_visitadas{loja:autopecas-do-passare} | count>0 | ok |
| lojas_visitadas{loja:farmacia-do-conjunto-palmeiras} | count>0 | ok |
| lojas_visitadas{loja:livraria-de-pedras} | count>0 | ok |
| lojas_visitadas{loja:padaria-da-granja-portugal} | count>0 | ok |
| lojas_visitadas{loja:papelaria-de-luciano-cavalcante} | count>0 | ok |
| lojas_visitadas{loja:calcados-do-parque-dois-irmaos} | count>0 | ok |
| lojas_visitadas{loja:construcao-de-dom-lustosa} | count>0 | ok |
| lojas_visitadas{loja:tabacaria-do-jardim-iracema} | count>0 | ok |
| lojas_visitadas{loja:eletronicos-de-sao-gerardo} | count>0 | ok |
| lojas_visitadas{loja:hamburgueria-de-carlito-pamplona} | count>0 | ok |
| lojas_visitadas{loja:padaria-de-aracape} | count>0 | ok |
| lojas_visitadas{loja:eletronicos-da-serrinha} | count>0 | ok |
| lojas_visitadas{loja:calcados-do-monte-castelo} | count>0 | ok |
| lojas_visitadas{loja:brinquedos-do-joquei-clube} | count>0 | ok |
| lojas_visitadas{loja:moda-do-parreao} | count>0 | ok |
| lojas_visitadas{loja:pizzaria-do-bom-jardim} | count>0 | ok |
| lojas_visitadas{loja:farmacia-de-quintino-cunha} | count>0 | ok |
| lojas_visitadas{loja:mercadinho-de-canindezinho} | count>0 | ok |
| lojas_visitadas{loja:livraria-de-joao-xxiii} | count>0 | ok |
| lojas_visitadas{loja:papelaria-do-meireles} | count>0 | ok |
| lojas_visitadas{loja:papelaria-de-paupina} | count>0 | ok |
| lojas_visitadas{loja:perfumaria-de-mata-galinha} | count>0 | ok |
| lojas_visitadas{loja:cozinha-do-benfica} | count>0 | ok |
| lojas_visitadas{loja:adega-da-praia-de-iracema} | count>0 | ok |
| lojas_visitadas{loja:perfumaria-de-sapiranga} | count>0 | ok |
| lojas_visitadas{loja:mercadinho-do-castelao} | count>0 | ok |
| lojas_visitadas{loja:acaiteria-de-moura-brasil} | count>0 | ok |
| lojas_visitadas{loja:brinquedos-do-cais-do-porto} | count>0 | ok |
| lojas_visitadas{loja:mercadinho-de-dionisio-torres} | count>0 | ok |
| lojas_visitadas{loja:pizzaria-da-bela-vista} | count>0 | ok |
| lojas_visitadas{loja:mercadinho-da-vila-peri} | count>0 | ok |
| falhas_inesperadas | rate<0.01 | ok |
| lojas_visitadas{loja:moda-de-presidente-kennedy} | count>0 | ok |
| lojas_visitadas{loja:moda-do-coco} | count>0 | ok |
| lojas_visitadas{loja:brinquedos-da-praia-do-futuro} | count>0 | ok |
| lojas_visitadas{loja:acaiteria-do-cambeba} | count>0 | ok |
| lojas_visitadas{loja:livraria-de-messejana} | count>0 | ok |
| lojas_visitadas{loja:adega-do-pirambu} | count>0 | ok |
| lojas_visitadas{loja:brinquedos-do-mucuripe} | count>0 | ok |
| lojas_visitadas{loja:construcao-da-cidade-dos-funcionarios} | count>0 | ok |
| lojas_visitadas{loja:mercadinho-do-jardim-cearense} | count>0 | ok |
| lojas_visitadas{loja:perfumaria-da-granja-lisboa} | count>0 | ok |
| lojas_visitadas{loja:calcados-de-joaquim-tavora} | count>0 | ok |
| lojas_visitadas{loja:floricultura-da-parquelandia} | count>0 | ok |
| lojas_visitadas{loja:bazar-da-varjota} | count>0 | ok |
| lojas_visitadas{loja:padaria-do-alagadico-novo} | count>0 | ok |
| lojas_visitadas{loja:bazar-do-planalto-ayrton-senna} | count>0 | ok |
| lojas_visitadas{loja:papelaria-de-genibau} | count>0 | ok |
| lojas_visitadas{loja:eletronicos-do-barroso} | count>0 | ok |
| checks{essencial:sim} | rate>0.99 | ok |
| http_reqs{op:meus_pedidos} | count>0 | ok |
| dropped_iterations{scenario:conta} | count==0 | ok |
| lojas_visitadas{loja:acaiteria-do-conjunto-ceara} | count>0 | ok |
| lojas_visitadas{loja:autopecas-do-jardim-guanabara} | count>0 | ok |
| lojas_visitadas{loja:farmacia-do-montese} | count>0 | ok |
| lojas_visitadas{loja:pizzaria-do-parque-manibura} | count>0 | ok |
| lojas_visitadas{loja:pet-shop-de-alvaro-weyne} | count>0 | ok |
| lojas_visitadas{loja:padaria-de-aerolandia} | count>0 | ok |
| lojas_visitadas{loja:cozinha-de-salinas} | count>0 | ok |
| lojas_visitadas{loja:floricultura-da-boa-vista} | count>0 | ok |
| lojas_visitadas{loja:cozinha-do-novo-mondubim} | count>0 | ok |
| lojas_visitadas{loja:acaiteria-da-agua-fria} | count>0 | ok |
| lojas_visitadas{loja:padaria-de-amadeu-furtado} | count>0 | ok |
| lojas_visitadas{loja:pet-shop-do-cristo-redentor} | count>0 | ok |
| lojas_visitadas{loja:pet-shop-de-ancuri} | count>0 | ok |
| lojas_visitadas{loja:hamburgueria-de-sao-joao-do-tauape} | count>0 | ok |
| lojas_visitadas{loja:livraria-da-cidade-2000} | count>0 | ok |
| http_reqs{op:fila} | count>0 | ok |
| totais_errados | count==0 | ok |
| lojas_visitadas{loja:farmacia-do-parque-araxa} | count>0 | ok |
| http_req_duration{op:catalogo,expected_response:true} | p(95)<500 | ok |
| http_req_duration{op:criar,expected_response:true} | p(95)<1000 | ok |
| http_req_duration{op:criar,expected_response:true} | p(99)<1000 | ok |
| lojas_visitadas{loja:restaurante-de-bonsucesso} | count>0 | ok |
| lojas_visitadas{loja:cozinha-do-jangurussu} | count>0 | ok |
| isolamento_violado | count==0 | ok |
| lojas_visitadas{loja:restaurante-de-dunas} | count>0 | ok |
| lojas_visitadas{loja:tabacaria-de-guararapes} | count>0 | ok |
| lojas_visitadas{loja:calcados-de-damas} | count>0 | ok |
| lojas_visitadas{loja:eletronicos-do-papicu} | count>0 | ok |
| lojas_visitadas{loja:pet-shop-de-prefeito-jose-walter} | count>0 | ok |
| lojas_visitadas{loja:cozinha-de-fatima} | count>0 | ok |
| lojas_visitadas{loja:construcao-de-cajazeiras} | count>0 | ok |
| lojas_visitadas{loja:pizzaria-de-siqueira} | count>0 | ok |
| lojas_visitadas{loja:floricultura-do-aeroporto} | count>0 | ok |
| lojas_visitadas{loja:hamburgueria-do-panamericano} | count>0 | ok |
