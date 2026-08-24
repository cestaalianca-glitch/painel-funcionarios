// Motor de cálculo do Painel de Funcionários — Cesta Aliança.
// Regras confirmadas com o usuário em 22/08/2026. Ver README.md pra explicação de cada uma.

/**
 * Fixo / diária / fixo+diária.
 */
function calcInformalFixoDiaria(func, diasTrabalhados) {
  const fixo = Number(func.valor_fixo) || 0;
  const diaria = (Number(func.valor_diaria) || 0) * (Number(diasTrabalhados) || 0);
  return { bruto: fixo + diaria, fixo, diaria };
}

/**
 * Comissão informal (Pedro, Juciano/Joãozinho, Jayme, Kinka — e base do João antes do formal).
 * ideal = média do vendido (emitido) nos 2 meses anteriores.
 * atingimento = recebido no mês / ideal.
 * comissão% = min(atingimento / 10, 9%).
 * comissão = comissão% × recebido no mês.
 */
function calcComissaoInformal(vendidoMesM1, vendidoMesM2, recebidoMes) {
  const ideal = ((Number(vendidoMesM1) || 0) + (Number(vendidoMesM2) || 0)) / 2;
  if (!ideal) return { ideal: 0, atingimentoPct: 0, comissaoPct: 0, comissaoValor: 0 };
  const atingimentoFrac = (Number(recebidoMes) || 0) / ideal;
  let comissaoPct = Math.min(atingimentoFrac / 10, 0.09);
  if (comissaoPct < 0) comissaoPct = 0;
  const comissaoValor = comissaoPct * (Number(recebidoMes) || 0);
  return { ideal, atingimentoPct: atingimentoFrac * 100, comissaoPct: comissaoPct * 100, comissaoValor };
}

/**
 * Encargos formais CLT sobre um valor de comissão base (só quem é "registrado" — hoje só o João).
 * Replica o Excel "Recibo de Pagamento Comissões.xlsx".
 * diasMes = dias no mês; domFeriados = domingos + feriados naquele mês (editável na hora do fechamento).
 */
function calcFormalCLT(comissaoBase, diasMes, domFeriados) {
  const C = Number(comissaoBase) || 0;
  const dm = Number(diasMes) || 30;
  const df = Number(domFeriados) || 0;
  const dsr = dm ? (C / dm) * df : 0;
  const decimoTerceiroProp = (C + dsr) / 12;
  const feriasProp = (C + dsr) / 12;
  const umTercoFeriasProp = feriasProp / 3;
  const totalVencimentos = C + dsr + decimoTerceiroProp + feriasProp + umTercoFeriasProp;
  return { comissaoBase: C, dsr, decimoTerceiroProp, feriasProp, umTercoFeriasProp, totalVencimentos };
}

/**
 * Inverso do cálculo formal: dado quanto se quer de líquido final (depois de descontos),
 * descobre o "valor de comissão base" a lançar — substitui o "Atingir Meta" manual do Excel.
 */
function calcFormalCLTReverso(liquidoDesejado, totalDescontos, diasMes, domFeriados) {
  const dm = Number(diasMes) || 30;
  const df = Number(domFeriados) || 0;
  const k = dm ? df / dm : 0;
  const fator = (1 + k) * (43 / 36);
  if (!fator) return 0;
  return ((Number(liquidoDesejado) || 0) + (Number(totalDescontos) || 0)) / fator;
}

/** Soma os descontos lançados (vale, falta, mercadoria, saldo anterior, outro). */
function somaDescontos(lista) {
  return (lista || []).reduce((acc, d) => acc + (Number(d.valor) || 0), 0);
}

/** Domingos de um mês/ano (contagem simples por calendário). */
function contarDomingos(ano, mes) {
  const dias = new Date(ano, mes, 0).getDate();
  let n = 0;
  for (let d = 1; d <= dias; d++) {
    if (new Date(ano, mes - 1, d).getDay() === 0) n++;
  }
  return n;
}
function diasNoMes(ano, mes) {
  return new Date(ano, mes, 0).getDate();
}

function fmtMoney(v) {
  return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function mesNome(m) {
  const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return nomes[m - 1] || '';
}
function mesAnterior(mes, ano) {
  return mes === 1 ? { mes: 12, ano: ano - 1 } : { mes: mes - 1, ano };
}
