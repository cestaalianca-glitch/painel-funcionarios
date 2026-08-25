-- Troca o acesso do Painel de Funcionários de "senha compartilhada só na tela" (RLS aberta pro
-- anon) pra exigir login de verdade (Supabase Auth) — agora que o repositório do app é público
-- no GitHub, a senha antiga ficou visível no código, então a trava precisa vir do banco.

drop policy if exists "rh anon full access - funcionarios" on rh_funcionarios;
drop policy if exists "rh anon full access - documentos" on rh_documentos;
drop policy if exists "rh anon full access - fechamentos" on rh_fechamentos;
drop policy if exists "rh anon full access - descontos" on rh_descontos;
drop policy if exists "rh anon full access - storage rh-documentos" on storage.objects;

create policy "rh authenticated full access - funcionarios" on rh_funcionarios for all to authenticated using (true) with check (true);
create policy "rh authenticated full access - documentos" on rh_documentos for all to authenticated using (true) with check (true);
create policy "rh authenticated full access - fechamentos" on rh_fechamentos for all to authenticated using (true) with check (true);
create policy "rh authenticated full access - descontos" on rh_descontos for all to authenticated using (true) with check (true);
create policy "rh authenticated full access - storage rh-documentos" on storage.objects for all to authenticated
  using (bucket_id = 'rh-documentos') with check (bucket_id = 'rh-documentos');
