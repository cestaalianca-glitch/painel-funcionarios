# Painel de Funcionários — Cesta Aliança

Sistema de fechamento de pagamento dos 11 funcionários, com cálculo automático de comissão
(puxado do painel principal) e do cálculo formal CLT do funcionário registrado.

## Regras de pagamento (confirmadas com o usuário em 22/08/2026)

- **Fixo / diária / fixo+diária** (Luan, Thiago, Tainan, Débora, Gabriel, Gustavo):
  `bruto = valor fixo + (dias trabalhados × valor da diária)`. Dias trabalhados são digitados
  na hora do fechamento (sem calendário dia-a-dia).
- **Comissão informal** (Pedro, Juciano, Jayme, Kinka, e base do João):
  - `ideal do mês` = média do **vendido** (emitido) nas rotas do vendedor, 2 meses e 1 mês atrás
    (porque toda venda é 2x/30-60 dias — o que entra no mês reflete vendas de meses anteriores).
  - `atingimento` = **recebido** real no mês ÷ ideal.
  - `% comissão` = min(atingimento ÷ 10, **9%** — teto fixo).
  - `comissão` = % comissão × recebido no mês.
  - Vendido/recebido por vendedor por mês vem de `comissao-vendedores.js`, gerado pelo script
    `Painel Alianca/scripts/build_comissao_vendedores.js` e publicado junto do painel principal.
    Mapeamento vendedor↔rota é o mesmo do painel (`rota_vendedor_map.js`).
- **Formal CLT** (só quem é `registrado = true` — hoje só o **João**): a comissão informal acima
  vira a "meta de líquido"; o sistema calcula de trás pra frente (substitui o "Atingir Meta" do
  Excel `Recibo de Pagamento Comissões.xlsx`) o valor de comissão **base** a declarar, que somado
  a DSR, 13º proporcional, férias proporcional e 1/3 férias proporcional bate exatamente nessa
  meta antes dos descontos. Fórmulas em `calc.js` (`calcFormalCLT` / `calcFormalCLTReverso`),
  validadas batendo 1:1 com o Excel original.
- **Descontos** (todo mundo): Vale/Adiantamento, Falta, Mercadoria, Saldo devedor do mês
  anterior, Outro — lançados manualmente no fechamento (não tem fórmula automática, cada combinado
  é diferente por funcionário).
- **Desligamento**: informal — só registra data, motivo, valor de acerto combinado e observação.
  Documentos e histórico continuam acessíveis depois de desligado.

## Onde mora

- Frontend: `index.html` + `app.js` (lógica/UI) + `calc.js` (motor de cálculo, sem dependência de
  DOM — pode ser testado isolado) + `config.js` (chaves públicas do Supabase + URL do painel).
- Banco: Supabase, mesmo projeto do [SistemaDistribuidora](../SistemaDistribuidora) (L.A. Correa),
  tabelas com prefixo `rh_` (`rh_funcionarios`, `rh_fechamentos`, `rh_descontos`,
  `rh_documentos`) — schema em `schema_supabase.sql`. Sem relação nenhuma com as tabelas da
  distribuidora, só compartilha o mesmo projeto/conta.
- Documentos dos funcionários: bucket privado `rh-documentos` no Supabase Storage.
- Senha de acesso: `config.js` (`SENHA_ACESSO`), guardada em `sessionStorage`.

## Como atualizar os dados de comissão

Rodar `node scripts/build_comissao_vendedores.js` de dentro de `Painel Alianca/`, e publicar o
`dashboard/comissao-vendedores.js` gerado junto com o resto do painel principal (mesmo deploy do
Netlify) — o app aqui busca esse arquivo direto do painel em produção.
