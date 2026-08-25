// Painel de Funcionários — Cesta Aliança. Lógica do app (Supabase + UI).

const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
let COMISSAO_DATA = null; // window.COMISSAO_VENDEDORES, carregado do painel principal
let FUNCIONARIOS_CACHE = [];

// ---------- Login (Supabase Auth — só quem tem conta criada consegue entrar) ----------
async function tentarLogin() {
  const email = document.getElementById('emailInput').value.trim();
  const senha = document.getElementById('senhaInput').value;
  document.getElementById('loginErro').textContent = '';
  const { error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) {
    document.getElementById('loginErro').textContent = 'E-mail ou senha incorretos.';
    return;
  }
  iniciarApp();
}
document.getElementById('senhaInput').addEventListener('keydown', e => { if (e.key === 'Enter') tentarLogin(); });
document.getElementById('emailInput').addEventListener('keydown', e => { if (e.key === 'Enter') tentarLogin(); });

function iniciarApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  carregarComissaoData();
  mudarView('funcionarios');
}
function sair() {
  sb.auth.signOut().then(() => location.reload());
}
sb.auth.getSession().then(({ data }) => { if (data.session) iniciarApp(); });

// ---------- Navegação ----------
function mudarView(v) {
  ['funcionarios','fechamento','historico'].forEach(id => {
    document.getElementById('view-' + id).classList.toggle('hidden', id !== v);
  });
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  if (v === 'funcionarios') carregarFuncionarios();
  if (v === 'fechamento') iniciarFechamentoDefault();
  if (v === 'historico') carregarSelectHistFuncionario();
}

// ---------- Dados do painel principal (comissão automática) ----------
function carregarComissaoData() {
  const s = document.createElement('script');
  s.src = window.PAINEL_URL + '/comissao-vendedores.js?_=' + Date.now();
  s.onload = () => { COMISSAO_DATA = window.COMISSAO_VENDEDORES || null; };
  s.onerror = () => { console.warn('Não consegui carregar comissao-vendedores.js do painel principal.'); };
  document.head.appendChild(s);
}

// ---------- Funcionários: lista ----------
async function carregarFuncionarios() {
  const { data, error } = await sb.from('rh_funcionarios').select('*').order('nome');
  if (error) { alert('Erro ao carregar funcionários: ' + error.message); return; }
  FUNCIONARIOS_CACHE = data || [];
  const el = document.getElementById('listaFuncionarios');
  if (!data || !data.length) { el.innerHTML = '<p class="muted">Nenhum funcionário cadastrado ainda.</p>'; return; }
  el.innerHTML = data.map(f => `
    <div class="emp-item" onclick="abrirFormFuncionario('${f.id}')">
      <div>
        <div class="name">${escapeHtml(f.nome)}</div>
        <div class="muted">${labelRegra(f)}</div>
      </div>
      <div>
        <span class="badge ${f.status}">${f.status === 'ativo' ? 'Ativo' : 'Desligado'}</span>
        ${f.registrado ? '<span class="badge registrado">Registrado</span>' : ''}
      </div>
    </div>`).join('');
}
function labelRegra(f) {
  if (f.regra_pagamento === 'comissao') return 'Comissão' + (f.vendedor_painel ? ' — ' + f.vendedor_painel : '');
  if (f.regra_pagamento === 'fixo') return 'Fixo ' + fmtMoney(f.valor_fixo);
  if (f.regra_pagamento === 'diaria') return 'Diária ' + fmtMoney(f.valor_diaria);
  if (f.regra_pagamento === 'fixo_diaria') return `Fixo ${fmtMoney(f.valor_fixo)} + diária ${fmtMoney(f.valor_diaria)}`;
  return '';
}
function escapeHtml(s) { return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ---------- Funcionários: cadastro/edição ----------
function abrirFormFuncionario(id) {
  const f = id ? FUNCIONARIOS_CACHE.find(x => x.id === id) : {};
  const isNovo = !id;
  const vendedores = (COMISSAO_DATA && COMISSAO_DATA.vendedores) || [];
  const html = `
    <div class="modal-bg" onclick="if(event.target===this) fecharModal()">
      <div class="modal">
        <h3>${isNovo ? 'Novo funcionário' : escapeHtml(f.nome)}</h3>
        <div class="grid">
          <div class="field" style="grid-column:1/-1"><label>Nome completo</label><input id="fNome" value="${escapeHtml(f.nome||'')}"></div>
          <div class="field"><label>CPF</label><input id="fCpf" value="${escapeHtml(f.cpf||'')}"></div>
          <div class="field"><label>RG</label><input id="fRg" value="${escapeHtml(f.rg||'')}"></div>
          <div class="field"><label>Telefone</label><input id="fTelefone" value="${escapeHtml(f.telefone||'')}"></div>
          <div class="field"><label>Data nascimento</label><input type="date" id="fNascimento" value="${f.data_nascimento||''}"></div>
          <div class="field"><label>Data admissão</label><input type="date" id="fAdmissao" value="${f.data_admissao||''}"></div>
          <div class="field" style="grid-column:1/-1"><label>Endereço</label><input id="fEndereco" value="${escapeHtml(f.endereco||'')}"></div>
        </div>
        <div class="field">
          <label><input type="checkbox" id="fRegistrado" ${f.registrado?'checked':''} style="width:auto;display:inline-block;margin-right:6px"> Registrado (carteira assinada)</label>
        </div>
        <div class="field">
          <label>Regra de pagamento</label>
          <select id="fRegra" onchange="atualizarCamposRegra()">
            <option value="fixo" ${f.regra_pagamento==='fixo'?'selected':''}>Só fixo (mensalista)</option>
            <option value="diaria" ${f.regra_pagamento==='diaria'?'selected':''}>Só diária</option>
            <option value="fixo_diaria" ${f.regra_pagamento==='fixo_diaria'?'selected':''}>Fixo + diária</option>
            <option value="comissao" ${f.regra_pagamento==='comissao'?'selected':''}>Comissão (vendedor)</option>
          </select>
        </div>
        <div class="row">
          <div class="field" id="wrapFixo" style="max-width:160px"><label>Valor fixo mensal</label><input type="number" step="0.01" id="fValorFixo" value="${f.valor_fixo||''}"></div>
          <div class="field" id="wrapDiaria" style="max-width:160px"><label>Valor da diária</label><input type="number" step="0.01" id="fValorDiaria" value="${f.valor_diaria||''}"></div>
          <div class="field" id="wrapVendedor" style="max-width:220px"><label>Vendedor (dados do painel)</label>
            <select id="fVendedorPainel">
              <option value="">— selecionar —</option>
              ${vendedores.map(v => `<option value="${v}" ${f.vendedor_painel===v?'selected':''}>${v}</option>`).join('')}
            </select>
          </div>
        </div>
        ${!isNovo ? `<div class="field"><label>Documentos</label><div id="docsList"></div>
          <div class="row" style="margin-top:6px">
            <select id="docTipo" style="max-width:220px">
              <option value="rg_cpf">RG/CPF</option>
              <option value="comprovante_endereco">Comprovante de endereço</option>
              <option value="carteira_contrato">Carteira/contrato</option>
              <option value="exame_atestado">Exame/atestado</option>
              <option value="outro">Outro</option>
            </select>
            <input type="file" id="docFile" style="max-width:220px">
            <button class="btn ghost" onclick="enviarDocumento('${id}')">Anexar</button>
          </div>
        </div>` : ''}
        <div class="row" style="justify-content:space-between; margin-top:14px">
          <div>
            ${!isNovo && f.status==='ativo' ? `<button class="btn danger" onclick="abrirDesligamento('${id}')">Desligar</button>` : ''}
          </div>
          <div class="row">
            <button class="btn ghost" onclick="fecharModal()">Cancelar</button>
            <button class="btn gold" onclick="salvarFuncionario('${id||''}')">Salvar</button>
          </div>
        </div>
      </div>
    </div>`;
  document.getElementById('modalRoot').innerHTML = html;
  atualizarCamposRegra();
  if (!isNovo) carregarDocumentos(id);
}
function atualizarCamposRegra() {
  const r = document.getElementById('fRegra').value;
  document.getElementById('wrapFixo').classList.toggle('hidden', r === 'diaria' || r === 'comissao');
  document.getElementById('wrapDiaria').classList.toggle('hidden', r === 'fixo' || r === 'comissao');
  document.getElementById('wrapVendedor').classList.toggle('hidden', r !== 'comissao');
}
function fecharModal() { document.getElementById('modalRoot').innerHTML = ''; }

async function salvarFuncionario(id) {
  const payload = {
    nome: document.getElementById('fNome').value.trim(),
    cpf: document.getElementById('fCpf').value.trim(),
    rg: document.getElementById('fRg').value.trim(),
    telefone: document.getElementById('fTelefone').value.trim(),
    endereco: document.getElementById('fEndereco').value.trim(),
    data_nascimento: document.getElementById('fNascimento').value || null,
    data_admissao: document.getElementById('fAdmissao').value || null,
    registrado: document.getElementById('fRegistrado').checked,
    regra_pagamento: document.getElementById('fRegra').value,
    valor_fixo: parseFloat(document.getElementById('fValorFixo').value) || 0,
    valor_diaria: parseFloat(document.getElementById('fValorDiaria').value) || 0,
    vendedor_painel: document.getElementById('fVendedorPainel').value || null,
  };
  if (!payload.nome) { alert('Nome é obrigatório.'); return; }
  let error;
  if (id) {
    ({ error } = await sb.from('rh_funcionarios').update(payload).eq('id', id));
  } else {
    ({ error } = await sb.from('rh_funcionarios').insert(payload));
  }
  if (error) { alert('Erro ao salvar: ' + error.message); return; }
  fecharModal();
  carregarFuncionarios();
}

// ---------- Documentos ----------
async function carregarDocumentos(funcionarioId) {
  const { data } = await sb.from('rh_documentos').select('*').eq('funcionario_id', funcionarioId).order('created_at');
  const el = document.getElementById('docsList');
  if (!el) return;
  if (!data || !data.length) { el.innerHTML = '<p class="muted">Nenhum documento anexado.</p>'; return; }
  el.innerHTML = data.map(d => `
    <div class="doc-item">
      <span>${labelTipoDoc(d.tipo)} — ${escapeHtml(d.nome_arquivo)}</span>
      <span><a href="#" onclick="abrirDocumento('${d.storage_path}');return false;">abrir</a> ·
      <a href="#" onclick="removerDocumento('${d.id}','${funcionarioId}');return false;" style="color:var(--red)">remover</a></span>
    </div>`).join('');
}
function labelTipoDoc(t) {
  return { rg_cpf:'RG/CPF', comprovante_endereco:'Comprov. endereço', carteira_contrato:'Carteira/contrato', exame_atestado:'Exame/atestado', outro:'Outro' }[t] || t;
}
async function enviarDocumento(funcionarioId) {
  const tipo = document.getElementById('docTipo').value;
  const fileInput = document.getElementById('docFile');
  const file = fileInput.files[0];
  if (!file) { alert('Escolha um arquivo.'); return; }
  const path = `${funcionarioId}/${Date.now()}_${file.name}`;
  const { error: upErr } = await sb.storage.from('rh-documentos').upload(path, file);
  if (upErr) { alert('Erro no upload: ' + upErr.message); return; }
  const { error } = await sb.from('rh_documentos').insert({ funcionario_id: funcionarioId, tipo, nome_arquivo: file.name, storage_path: path });
  if (error) { alert('Erro ao salvar registro: ' + error.message); return; }
  fileInput.value = '';
  carregarDocumentos(funcionarioId);
}
async function abrirDocumento(path) {
  const { data, error } = await sb.storage.from('rh-documentos').createSignedUrl(path, 300);
  if (error) { alert('Erro: ' + error.message); return; }
  window.open(data.signedUrl, '_blank');
}
async function removerDocumento(docId, funcionarioId) {
  if (!confirm('Remover esse documento?')) return;
  const { data: doc } = await sb.from('rh_documentos').select('storage_path').eq('id', docId).single();
  if (doc) await sb.storage.from('rh-documentos').remove([doc.storage_path]);
  await sb.from('rh_documentos').delete().eq('id', docId);
  carregarDocumentos(funcionarioId);
}

// ---------- Desligamento ----------
function abrirDesligamento(id) {
  const f = FUNCIONARIOS_CACHE.find(x => x.id === id);
  document.getElementById('modalRoot').innerHTML = `
    <div class="modal-bg" onclick="if(event.target===this) fecharModal()">
      <div class="modal">
        <h3>Desligar — ${escapeHtml(f.nome)}</h3>
        <p class="muted">O histórico e os documentos continuam guardados. Isso só marca como desligado.</p>
        <div class="field"><label>Data de saída</label><input type="date" id="dlgData" value="${new Date().toISOString().slice(0,10)}"></div>
        <div class="field"><label>Motivo</label><input id="dlgMotivo" placeholder="Ex: pedido de demissão, dispensa..."></div>
        <div class="field"><label>Valor do acerto (combinado)</label><input type="number" step="0.01" id="dlgValor"></div>
        <div class="field"><label>Observações</label><textarea id="dlgObs" rows="3"></textarea></div>
        <div class="row" style="justify-content:flex-end">
          <button class="btn ghost" onclick="abrirFormFuncionario('${id}')">Voltar</button>
          <button class="btn danger" onclick="confirmarDesligamento('${id}')">Confirmar desligamento</button>
        </div>
      </div>
    </div>`;
}
async function confirmarDesligamento(id) {
  const payload = {
    status: 'desligado',
    data_desligamento: document.getElementById('dlgData').value,
    motivo_desligamento: document.getElementById('dlgMotivo').value.trim(),
    valor_acerto: parseFloat(document.getElementById('dlgValor').value) || null,
    obs_desligamento: document.getElementById('dlgObs').value.trim(),
  };
  const { error } = await sb.from('rh_funcionarios').update(payload).eq('id', id);
  if (error) { alert('Erro: ' + error.message); return; }
  fecharModal();
  carregarFuncionarios();
}

// ---------- Fechamento mensal ----------
function iniciarFechamentoDefault() {
  const sel = document.getElementById('fechMes');
  if (!sel.options.length) {
    for (let m = 1; m <= 12; m++) sel.innerHTML += `<option value="${m}">${mesNome(m)}</option>`;
  }
  const hoje = new Date();
  sel.value = hoje.getMonth() + 1;
  document.getElementById('fechAno').value = hoje.getFullYear();
  carregarFechamentoMes();
}

async function carregarFechamentoMes() {
  const mes = parseInt(document.getElementById('fechMes').value, 10);
  const ano = parseInt(document.getElementById('fechAno').value, 10);
  const { data: funcs, error } = await sb.from('rh_funcionarios').select('*').eq('status', 'ativo').order('nome');
  if (error) { alert('Erro: ' + error.message); return; }
  const { data: fechExistentes } = await sb.from('rh_fechamentos').select('*').eq('mes', mes).eq('ano', ano);
  const mapFech = {}; (fechExistentes || []).forEach(f => mapFech[f.funcionario_id] = f);

  const el = document.getElementById('listaFechamento');
  el.innerHTML = '';
  for (const f of funcs) {
    const div = document.createElement('div');
    div.className = 'card';
    div.id = 'fech-' + f.id;
    el.appendChild(div);
    await renderCardFechamento(f, mes, ano, mapFech[f.id], div);
  }
  if (!funcs.length) el.innerHTML = '<p class="muted">Nenhum funcionário ativo.</p>';
}

async function buscarVendidoRecebido(vendedor, mes, ano) {
  if (!COMISSAO_DATA || !vendedor) return { vendidoM1: 0, vendidoM2: 0, recebidoMes: 0 };
  const key = (y,m) => `${y}-${String(m).padStart(2,'0')}`;
  const m1 = mesAnterior(mes, ano);
  const m2 = mesAnterior(m1.mes, m1.ano);
  const vendido = COMISSAO_DATA.vendido[vendedor] || {};
  const recebido = COMISSAO_DATA.recebido[vendedor] || {};
  return {
    vendidoM1: vendido[key(m1.ano, m1.mes)] || 0,
    vendidoM2: vendido[key(m2.ano, m2.mes)] || 0,
    recebidoMes: recebido[key(ano, mes)] || 0,
  };
}

async function renderCardFechamento(f, mes, ano, existente, container) {
  const jaFechado = existente && existente.status === 'fechado';
  container._existente = existente || null;

  let camposCalc = '';
  if (f.regra_pagamento === 'comissao') {
    const { vendidoM1, vendidoM2, recebidoMes } = await buscarVendidoRecebido(f.vendedor_painel, mes, ano);
    container._vendidoM1 = existente?.ideal_calculado != null ? null : vendidoM1;
    camposCalc = `
      <div class="row">
        <div class="field" style="max-width:150px"><label>Vendido mês -1</label><input type="number" step="0.01" id="in-vm1-${f.id}" value="${(existente?.formal_valor_comissao_base==null && existente)? '' : vendidoM1.toFixed(2)}"></div>
        <div class="field" style="max-width:150px"><label>Vendido mês -2</label><input type="number" step="0.01" id="in-vm2-${f.id}" value="${vendidoM2.toFixed(2)}"></div>
        <div class="field" style="max-width:150px"><label>Recebido no mês</label><input type="number" step="0.01" id="in-rec-${f.id}" value="${(existente?existente.recebido_mes:recebidoMes).toFixed(2)}"></div>
      </div>`;
    if (f.registrado) {
      const dm = diasNoMes(ano, mes), df = contarDomingos(ano, mes);
      camposCalc += `
      <div class="row">
        <div class="field" style="max-width:130px"><label>Dias no mês</label><input type="number" id="in-dm-${f.id}" value="${existente?.formal_dias_mes || dm}"></div>
        <div class="field" style="max-width:150px"><label>Domingos+feriados</label><input type="number" step="0.5" id="in-df-${f.id}" value="${existente?.formal_dom_feriados || df}"></div>
      </div>
      <p class="muted">Funcionário registrado — sistema calcula os encargos formais (DSR, 13º e férias proporcionais) automaticamente.</p>`;
    }
  } else {
    camposCalc = `<div class="row">
      <div class="field" style="max-width:150px"><label>Dias trabalhados</label><input type="number" step="0.5" id="in-dias-${f.id}" value="${existente?.dias_trabalhados ?? ''}"></div>
    </div>`;
  }

  if (jaFechado) camposCalc = camposCalc.replace(/<input /g, '<input disabled ');

  container.innerHTML = `
    <div class="row" style="justify-content:space-between">
      <h3 style="margin:4px 0">${escapeHtml(f.nome)} <span class="badge ${f.status}">${labelRegra(f)}</span></h3>
      ${jaFechado ? '<span class="badge" style="background:#DDEBE2;color:#1e7d4a">Fechado</span>' : ''}
    </div>
    <div id="calcArea-${f.id}">${camposCalc}</div>
    <div id="resumo-${f.id}" class="calc-box"></div>
    <div class="row" style="justify-content:flex-end">
      ${!jaFechado ? `<button class="btn ghost" onclick="recalcularCard('${f.id}', ${mes}, ${ano})">Recalcular</button>
      <button class="btn gold" onclick="abrirRecibo('${f.id}', ${mes}, ${ano})">Gerar recibo e fechar pagamento</button>` : `
      <button class="btn gold" onclick="abrirRecibo('${f.id}', ${mes}, ${ano})">Ver recibo</button>`}
    </div>
  `;
  document.querySelectorAll(`#calcArea-${f.id} input`).forEach(inp => inp.addEventListener('input', () => recalcularCard(f.id, mes, ano)));
  recalcularCard(f.id, mes, ano);
}

function recalcularCard(fId, mes, ano) {
  const container = document.getElementById('fech-' + fId);
  container._mes = mes; container._ano = ano;
  const f = FUNCIONARIOS_CACHE.find(x => x.id === fId);
  let bruto = 0, extraInfo = {};

  if (f.regra_pagamento === 'comissao') {
    const vm1 = parseFloat(document.getElementById('in-vm1-' + fId)?.value) || 0;
    const vm2 = parseFloat(document.getElementById('in-vm2-' + fId)?.value) || 0;
    const rec = parseFloat(document.getElementById('in-rec-' + fId)?.value) || 0;
    const r = calcComissaoInformal(vm1, vm2, rec);
    extraInfo = { ideal: r.ideal, atingimentoPct: r.atingimentoPct, comissaoPct: r.comissaoPct, comissaoValorInformal: r.comissaoValor, recebidoMes: rec };
    if (f.registrado) {
      // Preview sem descontos (descontos só entram na hora do recibo) — meta = comissão informal.
      const dm = parseFloat(document.getElementById('in-dm-' + fId)?.value) || 30;
      const df = parseFloat(document.getElementById('in-df-' + fId)?.value) || 0;
      const base = calcFormalCLTReverso(r.comissaoValor, 0, dm, df);
      const formal = calcFormalCLT(base, dm, df);
      extraInfo.formal = formal;
      extraInfo.formalDiasMes = dm;
      extraInfo.formalDomFeriados = df;
      bruto = formal.totalVencimentos;
    } else {
      bruto = r.comissaoValor;
    }
  } else {
    const dias = parseFloat(document.getElementById('in-dias-' + fId)?.value) || 0;
    const r = calcInformalFixoDiaria(f, dias);
    extraInfo = { fixo: r.fixo, diaria: r.diaria };
    bruto = r.bruto;
  }

  container._ultimoCalc = { bruto, extraInfo };

  const resumo = document.getElementById('resumo-' + fId);
  resumo.innerHTML = linhasVencimentos(f, extraInfo, bruto);
}

function linhasVencimentos(f, extraInfo, bruto) {
  let linhas = '';
  if (f.regra_pagamento === 'comissao') {
    linhas += `<div><span>Ideal (média 2 meses)</span><span>${fmtMoney(extraInfo.ideal)}</span></div>`;
    linhas += `<div><span>Atingimento</span><span>${(extraInfo.atingimentoPct||0).toFixed(1)}%</span></div>`;
    linhas += `<div><span>% Comissão (teto 9%)</span><span>${(extraInfo.comissaoPct||0).toFixed(2)}%</span></div>`;
    linhas += `<div><span>Comissão calculada</span><span>${fmtMoney(extraInfo.comissaoValorInformal)}</span></div>`;
    if (extraInfo.formal) {
      linhas += `<div><span>— Base declarada (comissão)</span><span>${fmtMoney(extraInfo.formal.comissaoBase)}</span></div>`;
      linhas += `<div><span>— DSR s/ comissão</span><span>${fmtMoney(extraInfo.formal.dsr)}</span></div>`;
      linhas += `<div><span>— 13º proporcional</span><span>${fmtMoney(extraInfo.formal.decimoTerceiroProp)}</span></div>`;
      linhas += `<div><span>— Férias proporcional</span><span>${fmtMoney(extraInfo.formal.feriasProp)}</span></div>`;
      linhas += `<div><span>— 1/3 férias proporcional</span><span>${fmtMoney(extraInfo.formal.umTercoFeriasProp)}</span></div>`;
    }
  } else {
    linhas += `<div><span>Fixo</span><span>${fmtMoney(extraInfo.fixo)}</span></div>`;
    linhas += `<div><span>Diária</span><span>${fmtMoney(extraInfo.diaria)}</span></div>`;
  }
  linhas += `<div style="border-top:1px solid #ccc;padding-top:4px;margin-top:4px"><strong>${extraInfo.formal ? 'Total Vencimentos' : 'Bruto'}</strong><strong>${fmtMoney(bruto)}</strong></div>`;
  return linhas;
}

// ---------- Recibo (descontos entram aqui, e é aqui que o pagamento é fechado de fato) ----------
function abrirRecibo(fId, mes, ano) {
  const f = FUNCIONARIOS_CACHE.find(x => x.id === fId);
  const container = document.getElementById('fech-' + fId);
  const existente = container._existente;
  const jaFechado = existente && existente.status === 'fechado';

  document.getElementById('modalRoot').innerHTML = `
    <div class="modal-bg" onclick="if(event.target===this) fecharModal()">
      <div class="modal" style="max-width:640px">
        <div id="reciboConteudo"></div>
        <div class="row" style="justify-content:flex-end; margin-top:14px" class="no-print">
          <button class="btn ghost" onclick="fecharModal()">Fechar</button>
          <button class="btn ghost" onclick="window.print()">Imprimir</button>
          ${!jaFechado ? `<button class="btn gold" onclick="confirmarFechamentoRecibo('${fId}', ${mes}, ${ano})">Confirmar e fechar pagamento</button>` : ''}
        </div>
      </div>
    </div>`;

  if (jaFechado) {
    carregarDescontosRecibo(fId, existente.id).then(descontos => renderRecibo(f, mes, ano, reconstruirExtraInfo(f, existente), existente.bruto, descontos, existente.liquido, true));
  } else {
    container._reciboDescontos = container._reciboDescontos || [];
    renderRecibo(f, mes, ano, container._ultimoCalc.extraInfo, container._ultimoCalc.bruto, container._reciboDescontos, null, false);
  }
}
async function carregarDescontosRecibo(fId, fechamentoId) {
  const { data } = await sb.from('rh_descontos').select('*').eq('fechamento_id', fechamentoId);
  return data || [];
}
function reconstruirExtraInfo(f, existente) {
  // Reconstrói a exibição a partir do que foi salvo (pra reabrir um recibo já fechado).
  if (f.regra_pagamento === 'comissao') {
    const extraInfo = {
      ideal: existente.ideal_calculado, atingimentoPct: existente.atingimento_pct,
      comissaoPct: existente.comissao_pct, comissaoValorInformal: existente.comissao_valor,
    };
    if (existente.formal_total_vencimentos != null) {
      extraInfo.formal = {
        comissaoBase: existente.formal_valor_comissao_base, dsr: existente.formal_dsr,
        decimoTerceiroProp: existente.formal_decimo_terceiro_prop, feriasProp: existente.formal_ferias_prop,
        umTercoFeriasProp: existente.formal_um_terco_ferias_prop, totalVencimentos: existente.formal_total_vencimentos,
      };
    }
    return extraInfo;
  }
  return { fixo: existente.valor_fixo_aplicado, diaria: existente.valor_diaria_aplicado };
}

const TIPOS_DESCONTO = { vale:'Vale/Adiantamento', falta:'Falta', mercadoria:'Mercadoria', saldo_anterior:'Saldo devedor anterior', outro:'Outro' };

function renderRecibo(f, mes, ano, extraInfo, bruto, descontos, liquidoSalvo, readonly) {
  const totalDescontos = somaDescontos(descontos);
  const liquido = liquidoSalvo != null ? liquidoSalvo : (bruto - totalDescontos);
  const hoje = new Date().toLocaleDateString('pt-BR');

  document.getElementById('reciboConteudo').innerHTML = `
    <div class="recibo-print">
      <div style="text-align:center; border-bottom:2px solid var(--navy); padding-bottom:10px; margin-bottom:10px">
        <strong>ALIANCE COMERCIO VAREJISTA DE PRODUTOS ALIMENTICIOS E BEBIDAS LTDA</strong><br>
        <span class="muted">CNPJ: 26.331.729/0001-34</span>
      </div>
      <p><strong>Funcionário:</strong> ${escapeHtml(f.nome)} ${f.registrado ? '(registrado)' : ''}<br>
      <strong>Referência:</strong> ${mesNome(mes)}/${ano}</p>

      <h3 style="margin-bottom:4px">Vencimentos</h3>
      <div class="calc-box">${linhasVencimentos(f, extraInfo, bruto)}</div>

      <h3 style="margin-bottom:4px">Descontos</h3>
      <div id="reciboDescontosLista"></div>

      <div class="calc-box" style="margin-top:10px">
        <div><span>Total Vencimentos</span><span>${fmtMoney(bruto)}</span></div>
        <div><span>Total Descontos</span><span class="money neg">- ${fmtMoney(totalDescontos)}</span></div>
        <div style="border-top:1px solid #ccc;padding-top:4px;margin-top:4px"><strong>Valor Líquido</strong><strong class="money pos">${fmtMoney(liquido)}</strong></div>
      </div>

      <p class="muted" style="margin-top:18px">Emitido em ${hoje}. &nbsp;&nbsp;&nbsp; Assinatura: _____________________________</p>
    </div>`;
  renderReciboDescontos(f.id, descontos, readonly);
}
function renderReciboDescontos(fId, descontos, readonly) {
  const el = document.getElementById('reciboDescontosLista');
  el.innerHTML = (!descontos.length ? '<p class="muted">Nenhum desconto lançado.</p>' : '') +
    descontos.map((d, i) => `<div class="desconto-row">
        <span style="min-width:150px">${TIPOS_DESCONTO[d.tipo]}</span>
        <span class="money neg">- ${fmtMoney(d.valor)}</span>
        <span class="muted" style="flex:2">${escapeHtml(d.observacao||'')}</span>
        ${!readonly ? `<button class="btn ghost" onclick="removerDescontoRecibo('${fId}',${i})">x</button>` : ''}
      </div>`).join('') +
    (!readonly ? `<div class="desconto-row">
        <select id="novoDescTipo-${fId}">${Object.entries(TIPOS_DESCONTO).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select>
        <input type="number" step="0.01" id="novoDescValor-${fId}" placeholder="Valor">
        <input id="novoDescObs-${fId}" placeholder="Observação (opcional)">
        <button class="btn ghost" onclick="adicionarDescontoRecibo('${fId}')">+ Adicionar</button>
      </div>` : '');
}
function adicionarDescontoRecibo(fId) {
  const container = document.getElementById('fech-' + fId);
  const tipo = document.getElementById('novoDescTipo-' + fId).value;
  const valor = parseFloat(document.getElementById('novoDescValor-' + fId).value) || 0;
  const observacao = document.getElementById('novoDescObs-' + fId).value.trim();
  if (!valor) return;
  container._reciboDescontos.push({ tipo, valor, observacao });
  reRenderReciboComDescontos(fId);
}
function removerDescontoRecibo(fId, idx) {
  const container = document.getElementById('fech-' + fId);
  container._reciboDescontos.splice(idx, 1);
  reRenderReciboComDescontos(fId);
}
function reRenderReciboComDescontos(fId) {
  const container = document.getElementById('fech-' + fId);
  const f = FUNCIONARIOS_CACHE.find(x => x.id === fId);
  let { bruto, extraInfo } = container._ultimoCalc;
  // Pra quem tem cálculo formal (João): o total de vencimentos precisa subir junto com o
  // desconto, pra manter o líquido final na meta calculada pela comissão informal.
  if (extraInfo.formal) {
    const totalDescontos = somaDescontos(container._reciboDescontos);
    const base = calcFormalCLTReverso(extraInfo.comissaoValorInformal, totalDescontos, extraInfo.formalDiasMes, extraInfo.formalDomFeriados);
    const formal = calcFormalCLT(base, extraInfo.formalDiasMes, extraInfo.formalDomFeriados);
    extraInfo = { ...extraInfo, formal };
    bruto = formal.totalVencimentos;
  }
  renderRecibo(f, container._mes, container._ano, extraInfo, bruto, container._reciboDescontos, null, false);
}

async function confirmarFechamentoRecibo(fId, mes, ano) {
  const container = document.getElementById('fech-' + fId);
  const calc = container._ultimoCalc;
  if (!calc) { alert('Calcule antes de fechar.'); return; }
  if (!confirm('Fechar esse pagamento e marcar como pago? Depois de fechado não dá pra editar por aqui.')) return;
  const f = FUNCIONARIOS_CACHE.find(x => x.id === fId);
  const descontos = container._reciboDescontos || [];
  const totalDescontos = somaDescontos(descontos);
  let extra = calc.extraInfo;
  let bruto = calc.bruto;

  // Pra quem tem cálculo formal (João), refaz com os descontos de verdade — a base declarada
  // muda quando existe desconto, pra ainda bater na meta de líquido calculada pela comissão informal.
  if (extra.formal) {
    const base = calcFormalCLTReverso(extra.comissaoValorInformal, totalDescontos, extra.formalDiasMes, extra.formalDomFeriados);
    const formal = calcFormalCLT(base, extra.formalDiasMes, extra.formalDomFeriados);
    extra = { ...extra, formal };
    bruto = formal.totalVencimentos;
  }
  const liquido = bruto - totalDescontos;

  const payload = {
    funcionario_id: fId, mes, ano,
    dias_trabalhados: f.regra_pagamento !== 'comissao' ? (parseFloat(document.getElementById('in-dias-' + fId)?.value) || 0) : null,
    valor_fixo_aplicado: extra.fixo ?? null,
    valor_diaria_aplicado: extra.diaria ?? null,
    ideal_calculado: extra.ideal ?? null,
    recebido_mes: extra.recebidoMes ?? null,
    atingimento_pct: extra.atingimentoPct ?? null,
    comissao_pct: extra.comissaoPct ?? null,
    comissao_valor: extra.comissaoValorInformal ?? null,
    formal_valor_comissao_base: extra.formal?.comissaoBase ?? null,
    formal_dias_mes: extra.formal ? extra.formalDiasMes : null,
    formal_dom_feriados: extra.formal ? extra.formalDomFeriados : null,
    formal_dsr: extra.formal?.dsr ?? null,
    formal_decimo_terceiro_prop: extra.formal?.decimoTerceiroProp ?? null,
    formal_ferias_prop: extra.formal?.feriasProp ?? null,
    formal_um_terco_ferias_prop: extra.formal?.umTercoFeriasProp ?? null,
    formal_total_vencimentos: extra.formal?.totalVencimentos ?? null,
    bruto, total_descontos: totalDescontos, liquido,
    status: 'fechado', fechado_em: new Date().toISOString(),
  };
  const { data, error } = await sb.from('rh_fechamentos').upsert(payload, { onConflict: 'funcionario_id,mes,ano' }).select().single();
  if (error) { alert('Erro ao fechar: ' + error.message); return; }
  if (descontos.length) {
    const rows = descontos.map(d => ({ fechamento_id: data.id, tipo: d.tipo, valor: d.valor, observacao: d.observacao }));
    await sb.from('rh_descontos').insert(rows);
  }
  fecharModal();
  carregarFechamentoMes();
}

// ---------- Histórico ----------
async function carregarSelectHistFuncionario() {
  const { data } = await sb.from('rh_funcionarios').select('id,nome,status').order('nome');
  const sel = document.getElementById('histFuncionario');
  sel.innerHTML = (data || []).map(f => `<option value="${f.id}">${escapeHtml(f.nome)}${f.status==='desligado'?' (desligado)':''}</option>`).join('');
  if (data && data.length) carregarHistorico();
}
async function carregarHistorico() {
  const fId = document.getElementById('histFuncionario').value;
  if (!fId) return;
  const { data } = await sb.from('rh_fechamentos').select('*').eq('funcionario_id', fId).order('ano', { ascending: false }).order('mes', { ascending: false });
  const el = document.getElementById('listaHistorico');
  if (!data || !data.length) { el.innerHTML = '<p class="muted">Nenhum fechamento registrado ainda.</p>'; return; }
  el.innerHTML = `<table><thead><tr><th>Mês</th><th>Bruto</th><th>Descontos</th><th>Líquido</th><th>Status</th><th></th></tr></thead><tbody>` +
    data.map(f => `<tr>
      <td>${mesNome(f.mes)}/${f.ano}</td>
      <td class="money">${fmtMoney(f.bruto)}</td>
      <td class="money neg">${fmtMoney(f.total_descontos)}</td>
      <td class="money pos">${fmtMoney(f.liquido)}</td>
      <td><span class="badge ${f.status==='fechado'?'ativo':'desligado'}">${f.status}</span></td>
      <td>${f.status==='fechado' ? `<button class="btn ghost" onclick="abrirReciboHistorico('${f.id}')">Ver recibo</button>` : ''}</td>
    </tr>`).join('') + `</tbody></table>`;
}

async function abrirReciboHistorico(fechamentoId) {
  const { data: existente, error } = await sb.from('rh_fechamentos').select('*').eq('id', fechamentoId).single();
  if (error) { alert('Erro: ' + error.message); return; }
  const { data: f } = await sb.from('rh_funcionarios').select('*').eq('id', existente.funcionario_id).single();
  const descontos = await carregarDescontosRecibo(null, existente.id);
  document.getElementById('modalRoot').innerHTML = `
    <div class="modal-bg" onclick="if(event.target===this) fecharModal()">
      <div class="modal" style="max-width:640px">
        <div id="reciboConteudo"></div>
        <div class="row" style="justify-content:flex-end; margin-top:14px">
          <button class="btn ghost" onclick="fecharModal()">Fechar</button>
          <button class="btn ghost" onclick="window.print()">Imprimir</button>
        </div>
      </div>
    </div>`;
  renderRecibo(f, existente.mes, existente.ano, reconstruirExtraInfo(f, existente), existente.bruto, descontos, existente.liquido, true);
}
