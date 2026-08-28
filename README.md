# Painel de Funcionários — Cesta Aliança

Sistema de fechamento de pagamento dos 11 funcionários, com cálculo automático de comissão
(puxado do painel principal), lançamentos do dia a dia e cálculo formal CLT (DSR, 13º e férias
proporcionais) aplicado a todos.

## Regras de pagamento (confirmadas com o usuário em 22/08/2026, encargos estendidos a todos em 26/08/2026)

- **Fixo / diária / fixo+diária** (Luan, Thiago, Débora, Gabriel, Gustavo — Tainan desligado):
  `bruto = valor fixo + (dias trabalhados × valor da diária)`. Dias trabalhados vêm pré-preenchidos
  pela contagem de lançamentos tipo "VR pago" daquele mês (ajustável na hora do fechamento).
- **Comissão informal** (Pedro, Juciano, Jayme, Kinka, João):
  - `ideal do mês` = média do **vendido** (emitido) nas rotas do vendedor, 2 meses e 1 mês atrás
    (porque toda venda é 2x/30-60 dias — o que entra no mês reflete vendas de meses anteriores).
  - `atingimento` = **recebido** real no mês ÷ ideal.
  - `% comissão` = min(atingimento ÷ 10, **9%** — teto fixo).
  - `comissão` = % comissão × recebido no mês.
  - Vendido/recebido por vendedor por mês vem de `comissao-vendedores.js`, gerado pelo script
    `Painel Alianca/scripts/build_comissao_vendedores.js` e publicado junto do painel principal.
    Mapeamento vendedor↔rota é o mesmo do painel (`rota_vendedor_map.js`).
- **Encargos formais (DSR, 13º proporcional, férias proporcional + 1/3)** — aplicados a **todos os
  11**, não só a quem tem carteira assinada. O valor bruto de cada um (fixo+diária, ou comissão
  informal) vira a "meta de líquido"; o sistema calcula de trás pra frente (substitui o "Atingir
  Meta" manual do Excel `Recibo de Pagamento Comissões.xlsx`) o valor **base** a declarar
  ("SALÁRIO" pra quem é fixo/diária, "COMISSÕES" pra quem é comissão) que, somado aos encargos,
  bate exatamente nessa meta antes dos descontos. Fórmulas em `calc.js` (`calcFormalCLT` /
  `calcFormalCLTReverso`), validadas batendo 1:1 com o Excel original. "Registrado" (carteira
  assinada, hoje só o João) é **apenas informativo** — não muda mais o cálculo de ninguém.
- **Descontos** (todo mundo): Vale/Adiantamento, Falta, Mercadoria, Saldo devedor do mês anterior,
  Outro — lançados **dentro do recibo**, na hora de gerar/fechar o pagamento (não na tela de
  fechamento). Pré-carregados automaticamente a partir dos lançamentos do dia a dia daquele mês
  (ver abaixo), mas ainda editáveis ali. Quando existe desconto, a base declarada é recalculada
  pra continuar batendo na mesma meta de líquido.
- **Lançamentos do dia a dia** (aba própria, desde 27/08/2026): registra na hora que acontece —
  vale, falta, mercadoria, saldo devedor anterior, outro, ou um dia de **VR pago** (R$25/dia).
  VR conta como dia trabalhado; os outros tipos entram como desconto pré-carregado no recibo do
  mês correspondente. Evita ter que lembrar tudo na hora de fechar.
- **Desligamento**: informal — só registra data, motivo, valor de acerto combinado e observação
  (sem cálculo de CLT automático). Documentos e histórico continuam acessíveis depois de
  desligado, e dá pra reverter se a pessoa voltar.

## Onde mora

- Frontend: `index.html` + `app.js` (lógica/UI) + `calc.js` (motor de cálculo, sem dependência de
  DOM — pode ser testado isolado) + `config.js` (chaves públicas do Supabase + URL do painel).
- Banco: Supabase, mesmo projeto do [SistemaDistribuidora](../SistemaDistribuidora) (L.A. Correa),
  tabelas com prefixo `rh_` (`rh_funcionarios`, `rh_fechamentos`, `rh_descontos`,
  `rh_documentos`, `rh_lancamentos`) — schema em `schema_supabase.sql` e nas migrations
  `0026_*`/`0027_*`/`0028_*`. Sem relação nenhuma com as tabelas da distribuidora, só compartilha
  o mesmo projeto/conta.
- Documentos dos funcionários: bucket privado `rh-documentos` no Supabase Storage.
- Recibo em Excel: gerado a partir do modelo real do usuário,
  `templates/recibo-comissao-formal-template.xlsx` (sanitizado, sem dado real de ninguém) — só
  preenche nome/mês/valor-base e deixa as fórmulas do próprio arquivo calcularem DSR/13º/férias.
  **Cuidado**: esse arquivo está num repositório público — antes de trocá-lo por uma versão nova,
  sempre sanitizar de novo (rodar por ExcelJS zerando valores em cache de fórmula; `--convert-to`
  do LibreOffice não recalcula fórmulas sozinho).

## Login

Supabase Auth de verdade (e-mail/senha) — trocado em 25/08/2026 depois do repositório do código
virar público, pra RLS não ficar exposta por uma senha visível no HTML. Conta única hoje:
`cestaalianca@gmail.com` / senha escolhida pelo usuário. Criar mais contas via Supabase Admin API
(`auth.admin.createUser`, precisa da `service_role` key do projeto).

## Como atualizar os dados de comissão

Rodar `node scripts/build_comissao_vendedores.js` de dentro de `Painel Alianca/`, e publicar o
`dashboard/comissao-vendedores.js` gerado junto com o resto do painel principal (mesmo deploy do
Netlify) — o app aqui busca esse arquivo direto do painel em produção.
