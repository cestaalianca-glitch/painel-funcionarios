-- Nome do vendedor tal como aparece no mapeamento Rota->Vendedor do painel principal
-- (Jayme, João, Juciano/Joãozinho, Kinka, Luan, Pedro), usado pra puxar vendido/recebido
-- automático em comissao-vendedores.js. Só preenchido pra regra_pagamento = 'comissao'.
alter table rh_funcionarios add column vendedor_painel text;
