# Detalhes por board

Os nomes exatos das ferramentas dos conectores variam por instalação. Procure-as pelo nome do serviço e leia a descrição de cada uma antes de usar.

## Notion
- **Ler:** use a ferramenta de busca do conector para achar a página pelo ID do card (propriedade de ID único, ex.: `VST-123`) ou pela URL. Depois leia a página completa (propriedades + conteúdo + comentários).
- **Status:** atualize a propriedade de status da página (`Status` ou equivalente no banco).
- **Comentário:** use a ferramenta de comentário do conector na página.
- **Dívida técnica:** crie uma página nova no mesmo banco de dados, com status `board.statusDividaTecnica`.
- **Observação:** o ID único do Notion costuma ser uma propriedade `ID` com prefixo configurável. Guarde o prefixo em `board.idPrefixo`.

## Linear
- **Ler:** ferramenta de leitura de issue pelo identificador (`ENG-123`), incluindo comentários.
- **Status:** atualize o estado da issue para o nome configurado.
- **Comentário:** ferramenta de comentário.
- **Dívida técnica:** crie uma issue no mesmo time, com label `tech-debt`.

## GitHub Issues / Projects
- **Ler:** `gh issue view <n> --json number,title,body,labels,comments,url`
- **Status em Projects:** `gh project item-edit` exige IDs do projeto e do campo; se não estiverem configurados em `board.observacoes`, use labels (`gh issue edit <n> --add-label "agente:em-andamento"`).
- **Comentário:** `gh issue comment <n> --body-file <arquivo>`
- **Dívida técnica:** `gh issue create --title "[Dívida] ..." --body-file <arquivo> --label tech-debt`
- **Proibido:** qualquer comando `gh pr ...` que crie, aprove ou faça merge de PR (bloqueado pelos hooks).

## Jira
- **Ler:** ferramenta do conector para obter a issue (campos, descrição em ADF/markdown, comentários).
- **Status:** transições do Jira têm IDs; liste as transições disponíveis e escolha a que leva ao status configurado.
- **Comentário** e **dívida técnica:** ferramentas do conector (tipo `Task` ou `Tech Debt`).

## Trello
- **Ler:** cartão (nome, descrição, checklists, anexos, comentários).
- **Status:** mover o cartão para a lista com o nome configurado.

## Modo manual (sem conector)
- O argumento é texto ou caminho de arquivo. Salve em `card.md` com `Fonte: texto`.
- Na entrega, o bloco-resumo vai na resposta final; o humano atualiza o board.

## CI (execução headless)
No GitHub Actions, os conectores do board precisam de um arquivo de configuração MCP com tokens em secrets (ver `docs/ci-headless.md`). Sem isso, o agente roda em modo manual: o card chega pelo `client_payload` do disparo.
