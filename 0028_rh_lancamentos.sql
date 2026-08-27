-- Lançamentos do dia a dia (vale, falta, mercadoria, saldo anterior, outro desconto, dia de VR
-- pago) — registrados no momento em que acontecem, não só na hora de fechar o mês. Alimentam o
-- fechamento automaticamente: "VR pago" vira dias trabalhados (R$25/dia), o resto vira desconto.
create table rh_lancamentos (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references rh_funcionarios(id) on delete cascade,
  tipo text not null check (tipo in ('vr','vale','falta','mercadoria','saldo_anterior','outro')),
  data date not null,
  valor numeric(10,2),
  observacao text,
  created_at timestamptz not null default now()
);

create index idx_rh_lancamentos_funcionario_data on rh_lancamentos(funcionario_id, data);

alter table rh_lancamentos enable row level security;
create policy "rh authenticated full access - lancamentos" on rh_lancamentos for all to authenticated using (true) with check (true);
