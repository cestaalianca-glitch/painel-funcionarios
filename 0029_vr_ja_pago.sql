-- Corrige falha real: o sistema sempre assumia que o VR (diária) já tinha sido pago em
-- dinheiro ao longo do mês, subtraindo ele do líquido incondicionalmente. Isso está errado
-- pra quem ainda não recebeu (descoberto em 10/09/2026 com Gustavo/Luan/Deivid Gabriel,
-- cujo VR estava pendente, não pago) — o sistema silenciosamente "sumia" com esse dinheiro,
-- nem pagava em dinheiro (não tinha sido pago) nem incluía no líquido (assumia que já tinha).
alter table rh_fechamentos add column if not exists vr_ja_pago boolean not null default false;
