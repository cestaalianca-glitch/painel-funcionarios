-- Painel de Funcionários da Cesta Aliança (sistema separado do distribuidora, mesmo projeto Supabase).
-- Prefixo "rh_" pra não colidir com nada do resto do banco.
-- Acesso: mesmo esquema dos outros painéis Aliança (senha compartilhada na tela, não Supabase Auth
-- por usuário) — RLS libera pro anon key, confiança fica na senha da tela + no fato de que só
-- gente de confiança tem o link.

create table rh_funcionarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cpf text,
  rg text,
  endereco text,
  telefone text,
  data_nascimento date,
  data_admissao date,
  registrado boolean not null default false,
  regra_pagamento text not null check (regra_pagamento in ('fixo','diaria','fixo_diaria','comissao')),
  valor_fixo numeric(10,2) default 0,
  valor_diaria numeric(10,2) default 0,
  rotas text[] default '{}',                 -- rotas do vendedor (regra comissao), casa com o mapeamento do painel principal
  status text not null default 'ativo' check (status in ('ativo','desligado')),
  data_desligamento date,
  motivo_desligamento text,
  valor_acerto numeric(10,2),
  obs_desligamento text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table rh_documentos (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references rh_funcionarios(id) on delete cascade,
  tipo text not null check (tipo in ('rg_cpf','comprovante_endereco','carteira_contrato','exame_atestado','outro')),
  nome_arquivo text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table rh_fechamentos (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references rh_funcionarios(id) on delete restrict,
  mes int not null check (mes between 1 and 12),
  ano int not null,
  -- fixo/diária
  dias_trabalhados numeric(5,2),
  valor_fixo_aplicado numeric(10,2),
  valor_diaria_aplicado numeric(10,2),
  -- comissão informal
  ideal_calculado numeric(12,2),
  recebido_mes numeric(12,2),
  atingimento_pct numeric(6,3),
  comissao_pct numeric(6,3),
  comissao_valor numeric(12,2),
  -- formal CLT (só quem é "registrado", hoje só o João)
  formal_valor_comissao_base numeric(12,2),
  formal_dias_mes int,
  formal_dom_feriados numeric(5,2),
  formal_dsr numeric(12,2),
  formal_decimo_terceiro_prop numeric(12,2),
  formal_ferias_prop numeric(12,2),
  formal_um_terco_ferias_prop numeric(12,2),
  formal_total_vencimentos numeric(12,2),
  -- resultado
  bruto numeric(12,2) not null default 0,
  total_descontos numeric(12,2) not null default 0,
  liquido numeric(12,2) not null default 0,
  status text not null default 'aberto' check (status in ('aberto','fechado')),
  fechado_em timestamptz,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (funcionario_id, mes, ano)
);

create table rh_descontos (
  id uuid primary key default gen_random_uuid(),
  fechamento_id uuid not null references rh_fechamentos(id) on delete cascade,
  tipo text not null check (tipo in ('vale','falta','mercadoria','saldo_anterior','outro')),
  valor numeric(10,2) not null,
  observacao text,
  created_at timestamptz not null default now()
);

create index idx_rh_fechamentos_funcionario on rh_fechamentos(funcionario_id);
create index idx_rh_fechamentos_mes_ano on rh_fechamentos(ano, mes);
create index idx_rh_documentos_funcionario on rh_documentos(funcionario_id);
create index idx_rh_descontos_fechamento on rh_descontos(fechamento_id);

alter table rh_funcionarios enable row level security;
alter table rh_documentos enable row level security;
alter table rh_fechamentos enable row level security;
alter table rh_descontos enable row level security;

create policy "rh anon full access - funcionarios" on rh_funcionarios for all to anon using (true) with check (true);
create policy "rh anon full access - documentos" on rh_documentos for all to anon using (true) with check (true);
create policy "rh anon full access - fechamentos" on rh_fechamentos for all to anon using (true) with check (true);
create policy "rh anon full access - descontos" on rh_descontos for all to anon using (true) with check (true);

-- Bucket de armazenamento dos documentos dos funcionários (privado, só acessível via URL assinada)
insert into storage.buckets (id, name, public) values ('rh-documentos', 'rh-documentos', false)
on conflict (id) do nothing;

create policy "rh anon full access - storage rh-documentos" on storage.objects for all to anon
  using (bucket_id = 'rh-documentos') with check (bucket_id = 'rh-documentos');
