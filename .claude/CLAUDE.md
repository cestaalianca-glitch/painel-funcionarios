# painel-funcionarios — fechamento de pagamento dos funcionários (repositório PÚBLICO, GitHub Pages)

Responder sempre em português. Este repositório é **público** e a branch `master` vai direto para o ar: nunca colocar nome completo, CPF, salário, comissão ou qualquer dado de funcionário ou de cliente em nenhum arquivo, nem senha, token ou chave de serviço. A chave pública do Supabase em `config.js` é pública por desenho: quem lê as tabelas é decidido pelo RLS, depois do login. Os dados de verdade ficam só no banco.

Este manual fica em `.claude/` de propósito: na raiz ele seria publicado junto com a página.

## Para que serve
Fechar o pagamento do mês de cada funcionário: fixo, diária, comissão do vendedor (que vem pronta do painel principal), lançamentos do dia a dia (vale, falta, mercadoria, desconto) e recibo. Quem usa é o Gestor.

## Mapa: o que mora onde

| Assunto | Arquivo |
|---|---|
| Tela e interação (abas, lançamentos, fechamento, recibo em planilha) | `index.html`, `app.js` |
| Regras de cálculo (fixo, diária, comissão, piso, vale) | `calc.js` (a explicação de cada regra está no `README.md`) |
| Login e chaves públicas | `config.js` |
| Modelo do recibo em planilha (só rótulos, sem dado) | `templates/recibo-comissao-formal-template.xlsx` |
| Estrutura do banco (tabelas `rh_*` e regras de acesso) | `schema_supabase.sql` e as migrações numeradas `00NN_*.sql` |
| Esteiras e governança | `.github/workflows/esteira.yml`, `.github/workflows/saude.yml`, `.github/ci/` |

De onde vem a comissão: linha de comissão em `painel_dados` no Supabase, calculada no repositório privado do ecossistema (`scripts/build_comissao_vendedores.js`). Regra de comissão errada na tela pode ser dado de lá, não cálculo daqui.

## Economia de tokens (vale para toda sessão)
- Não reler o repositório: o mapa acima diz o arquivo. `app.js` tem mais de 900 linhas: procurar a função com `grep -n` e ler só a faixa.
- Para saber o que mudou: `git log --oneline -10`, depois `git diff master...HEAD --stat` e só então o diff do arquivo que interessa.
- Uma tarefa, uma branch curta (`feat/...` ou `fix/...`) saída da `master` atualizada. Depois do merge, a limpeza semanal apaga a branch.
- Estado do repositório em um comando: `node .github/ci/saude-repo.js`.
- Pendências e ideias ficam nas Issues do repositório privado do ecossistema, não em arquivo.

## Esteiras do GitHub
- **`esteira.yml`**, em todo push e todo pull request: trava da linha pública (`.github/ci/conferir-publico.js`), sintaxe de todo `.js`, versão limpa e **prévia baixável** (artefato `previa-funcionarios-<commit>`, 14 dias).
- **Publicação**: não passa pela esteira. O GitHub Pages publica sozinho o que entra na `master`. Por isso: nunca trabalhar direto na `master`.
- **`saude.yml`**, toda segunda-feira: audita branches, esteiras e se a página está no ar; apaga as branches já incorporadas e paradas há mais de 7 dias.
- **Ganchos locais** (ligar uma vez por computador: `node .github/ci/instalar-ganchos.js`): a mesma trava roda antes de cada commit e de cada envio.
- Exceções declaradas da trava, cada uma com o motivo: `.github/ci/permitidos.json` (o modelo de planilha, o e-mail de acesso citado no leia-me e um valor de regra citado no leia-me).
- Mudança no banco: migração nova numerada, aplicada pelo Gestor no Supabase; nunca apagar nem reescrever migração antiga.

## Fluxo para mudar a tela ou uma regra
1. Criar uma branch `feat/...` a partir da `master` atualizada.
2. Regra de cálculo: conferir com um mês já fechado antes e depois da mudança.
3. Enviar a branch: a esteira confere e guarda a prévia (aba Actions).
4. Abrir um pull request para a `master`, com a esteira verde. O Gestor aprova. Só o merge publica.
