// SAÚDE DO REPOSITÓRIO (governança, 15/11/2026): auditoria periódica + limpeza das branches já incorporadas. Usa o gh (API do GitHub).
//   node .github/ci/saude-repo.js                    audita este repositório
//   node .github/ci/saude-repo.js --limpar           ... e apaga as branches remotas já incorporadas ao principal (regras abaixo)
//   node .github/ci/saude-repo.js --todos            audita TODOS os repositórios da conta de uma vez (uso no PC, com o gh logado)
//   node .github/ci/saude-repo.js --repo dono/nome   audita outro repositório (só o que a API mostra)
//   --issue  abre/atualiza a Issue de alerta (rótulo saude-automatica) e fecha quando tudo volta ao normal · --json  saída para máquina
// O que olha: proteção do principal · branches (incorporada, parada, em andamento) · esteiras (desligada, falhando, agendada sem rodar) ·
// minutos de Actions do mês (repositório privado) · artefatos guardados · pull requests velhos · e, neste repositório, o frescor dos
// dados da nuvem e a trava (os commits automáticos não passam pela esteira de push). Regras em .github/ci/governanca.json.
// LIMPEZA: só apaga branch que (1) já está inteira no principal, ou entrou por pull request com o mesmo commit; (2) tem o último commit
// há mais de limpeza.diasMinimos dias; (3) não está em limpeza.branchesProtegidas; (4) não tem pull request aberto. Branch com trabalho
// que ainda não entrou NUNCA é apagada: só aparece no relatório como "parada".
// Sai com 1 quando há ALERTA (a esteira falha e o GitHub avisa por e-mail); ponto de atenção não derruba.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const RAIZ = path.resolve(__dirname, '..', '..');
const arg = process.argv.slice(2), tem = f => arg.includes(f), valor = f => { const i = arg.indexOf(f); return i >= 0 ? arg[i + 1] : null; };
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'governanca.json'), 'utf8')), S = cfg.saude || {}, L = cfg.limpeza || {};
const LIMPAR = tem('--limpar'), DIAS_MIN = L.diasMinimos ?? 7;

function gh(a) {
  const r = cp.spawnSync('gh', a, { encoding: 'utf8', maxBuffer: 512e6 });
  if (r.status !== 0) { const e = new Error(((r.stderr || '').trim().split('\n').pop() || 'gh falhou').slice(0, 200)); e.http = +((/HTTP (\d{3})/.exec(r.stderr || '') || [])[1] || 0); throw e; }
  return r.stdout;
}
const api = (c, jq) => JSON.parse(gh(jq ? ['api', c, '--jq', jq] : ['api', c]));
const linhas = (c, jq, todas) => gh(['api', c, ...(todas ? ['--paginate'] : []), '--jq', jq]).split('\n').filter(Boolean).map(l => JSON.parse(l));
const tenta = (fn, padrao) => { try { return fn(); } catch (e) { return typeof padrao === 'function' ? padrao(e) : padrao; } };
const enc = s => encodeURIComponent(s).replace(/%2F/g, '/');
const HOJE = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const dias = iso => Math.floor((Date.now() - Date.parse(iso)) / 864e5), diasDaData = d => Math.round((Date.parse(HOJE) - Date.parse(d)) / 864e5);
const br = iso => iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
const protegida = n => (L.branchesProtegidas || []).some(p => p.endsWith('*') ? n.startsWith(p.slice(0, -1)) : p === n);
const repoLocal = () => (process.env.GITHUB_REPOSITORY || (/github\.com[:/]([^/]+\/[^/.\s]+)/.exec(tenta(() => cp.execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: RAIZ, encoding: 'utf8' }), '')) || [])[1] || '');

async function auditar(R, local) {
  const alertas = [], atencao = [], notas = [], tab = { branches: [], esteiras: [], minutos: [] }, apagadas = [];
  const info = api(`repos/${R}`, '{private, default_branch, delete_branch_on_merge, archived, open_issues_count}'), principal = info.default_branch, dono = R.split('/')[0];

  // proteção do principal: a proteção clássica da branch ou as regras do repositório (rulesets) que valem para ela
  let classica = false, prot = tenta(() => { api(`repos/${R}/branches/${enc(principal)}/protection`, '{url}'); classica = true; return 'protegida'; }, e => e.http === 404 && /not protected/i.test(e.message) ? 'sem proteção' : /Upgrade to GitHub Pro/i.test(e.message) ? 'indisponível no plano gratuito (repositório privado)' : 'não consegui ler');
  if (prot === 'não consegui ler') prot = tenta(() => api(`repos/${R}/branches/${enc(principal)}`, '{protected}').protected ? 'protegida' : info.private ? 'indisponível no plano gratuito (repositório privado)' : 'sem proteção', 'não consegui ler');   // na esteira o token não lê a proteção clássica: vale o campo "protected" da branch
  const valem = tenta(() => linhas(`repos/${R}/rules/branches/${enc(principal)}?per_page=100`, '.[] | {type}').map(x => x.type), []);   // regras ativas que valem para o principal; repositório privado no plano gratuito não tem regras: fica vazio
  const falta = [['non_fast_forward', 'envio forçado (force-push)'], ['deletion', 'apagar a branch']].filter(([t]) => !valem.includes(t)).map(([, n]) => n);
  if (!falta.length) prot = 'protegida por regra do repositório (recusa envio forçado e não deixa apagar a branch)';
  else if (valem.length && !classica) prot = `regra incompleta: nada impede ${falta.join(' nem ')}`;
  notas.push(`Branch principal \`${principal}\`: ${prot}.`);
  if (prot === 'sem proteção') atencao.push(`branch principal \`${principal}\` sem proteção: nada impede force-push ou apagar a branch`);
  else if (prot.startsWith('regra incompleta')) atencao.push(`branch principal \`${principal}\` com ${prot}`);

  // branches
  const ramos = linhas(`repos/${R}/branches?per_page=100`, '.[] | {name, sha: .commit.sha, protected}', true);
  for (const b of ramos) {
    if (b.name === principal) continue;
    const cmp = tenta(() => api(`repos/${R}/compare/${enc(principal)}...${enc(b.name)}`, '{ahead_by, behind_by}'), null);
    const ult = tenta(() => api(`repos/${R}/commits/${b.sha}`, '{d: .commit.committer.date}').d, null), idade = ult ? dias(ult) : null;
    const prs = tenta(() => linhas(`repos/${R}/pulls?state=all&per_page=30&head=${dono}:${encodeURIComponent(b.name)}`, '.[] | {number, state, merged_at, sha: .head.sha}'), []);
    const prAberto = prs.find(p => p.state === 'open'), inteira = !!cmp && cmp.ahead_by === 0, porPR = !inteira && prs.some(p => p.merged_at && p.sha === b.sha);
    let situacao, acao;
    if (inteira || porPR) {
      situacao = inteira ? `já incorporada ao ${principal}` : 'incorporada por pull request';
      if (b.protected || protegida(b.name)) acao = 'protegida: fica';
      else if (prAberto) acao = `pull request #${prAberto.number} aberto: fica`;
      else if (idade == null || idade < DIAS_MIN) acao = `recente: fica até completar ${DIAS_MIN} dias`;
      else if (!LIMPAR) acao = 'pode ser apagada (limpeza semanal ou --limpar)';
      else try { gh(['api', '-X', 'DELETE', `repos/${R}/git/refs/heads/${enc(b.name)}`]); acao = 'APAGADA agora'; apagadas.push(b.name); } catch (e) { acao = 'não consegui apagar'; atencao.push(`não consegui apagar a branch incorporada \`${b.name}\`: ${e.message}`); }
    } else {
      situacao = cmp ? `${cmp.ahead_by} commit(s) à frente, ${cmp.behind_by} atrás` : 'não consegui comparar';
      if (prAberto) acao = `pull request #${prAberto.number} aberto`;
      else if (idade != null && idade >= (S.branchParadaDias ?? 30)) { acao = 'PARADA: decidir (terminar, abrir pull request ou apagar)'; atencao.push(`branch \`${b.name}\` parada há ${idade} dias, com trabalho que não entrou no ${principal}`); }
      else acao = 'em andamento';
    }
    tab.branches.push([`\`${b.name}\``, situacao, ult ? `${br(ult)} (${idade} d)` : '—', acao]);
  }

  // esteiras
  const wfs = tenta(() => linhas(`repos/${R}/actions/workflows?per_page=100`, '.workflows[] | {id, name, path, state}', true), []);
  for (const w of wfs) {
    const ult = tenta(() => linhas(`repos/${R}/actions/workflows/${w.id}/runs?per_page=8&status=completed&branch=${encodeURIComponent(principal)}`, '.workflow_runs[] | {conclusion, created_at}'), []);
    const agendada = tenta(() => linhas(`repos/${R}/actions/workflows/${w.id}/runs?per_page=1&event=schedule`, '.workflow_runs[] | {created_at}')[0], null);
    let seguidas = 0; for (const r of ult) { if (['failure', 'timed_out', 'startup_failure'].includes(r.conclusion)) seguidas++; else if (r.conclusion === 'success') break; }
    if (w.state !== 'active') alertas.push(`esteira "${w.name}" está desligada (${w.state === 'disabled_inactivity' ? 'o GitHub desligou por 60 dias sem atividade no repositório' : w.state})`);
    else if (seguidas >= (S.falhasSeguidasAlerta ?? 2)) alertas.push(`esteira "${w.name}" falhou nas últimas ${seguidas} rodadas no ${principal}`);
    const limite = (S.agendadoSemRodarPorArquivo || {})[w.path.split('/').pop()] ?? S.agendadoSemRodarDias ?? 3;   // a semanal precisa de folga maior que a diária
    if (w.state === 'active' && agendada && dias(agendada.created_at) > limite) alertas.push(`esteira agendada "${w.name}" não roda há ${dias(agendada.created_at)} dias`);
    tab.esteiras.push([w.name, w.state === 'active' ? 'ligada' : 'DESLIGADA', ult[0] ? `${ult[0].conclusion === 'success' ? 'ok' : ult[0].conclusion} em ${br(ult[0].created_at)}` : 'nunca rodou no ' + principal, agendada ? `sim (última ${br(agendada.created_at)})` : '—', String(seguidas)]);
  }

  // minutos de Actions (só repositório privado paga): soma por job, cada um arredondado para cima, últimos 7 dias × 30/7
  if (info.private) {
    const desde = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10), porWf = new Map(); let total = 0;
    const runs = tenta(() => linhas(`repos/${R}/actions/runs?per_page=100&created=${encodeURIComponent('>=' + desde)}`, '.workflow_runs[] | {id, name}', true), []);
    for (const r of runs) for (const j of tenta(() => linhas(`repos/${R}/actions/runs/${r.id}/jobs?per_page=100`, '.jobs[] | {started_at, completed_at, conclusion}'), [])) {
      if (!j.started_at || !j.completed_at || j.conclusion === 'skipped') continue;
      const min = Math.max(1, Math.ceil((Date.parse(j.completed_at) - Date.parse(j.started_at)) / 60000)); total += min; porWf.set(r.name, (porWf.get(r.name) || 0) + min);
    }
    const mes = Math.round(total * 30 / 7), gratis = S.minutosGratisMes ?? 2000, pct = Math.round(mes / gratis * 100);
    notas.push(`Minutos de Actions: ${total} nos últimos 7 dias (${runs.length} rodadas) → cerca de ${mes} por mês, ${pct}% dos ${gratis} gratuitos.`);
    if (pct >= (S.alertaMinutosPorcento ?? 70)) alertas.push(`consumo de minutos do GitHub Actions em ${pct}% da cota gratuita do mês (cerca de ${mes} de ${gratis})`);
    tab.minutos = [...porWf].sort((a, b) => b[1] - a[1]).map(([n, m]) => [n, String(m), String(Math.round(m * 30 / 7))]);
  }

  // artefatos e pull requests
  const art = tenta(() => api(`repos/${R}/actions/artifacts?per_page=100`, '{n: .total_count, b: ([.artifacts[] | select(.expired == false) | .size_in_bytes] | add // 0)}'), null);
  if (art) { notas.push(`Artefatos guardados: ${art.n} (${(art.b / 1e6).toFixed(1)} MB ativos).`); if (info.private && art.b > 300e6) atencao.push(`artefatos ocupando ${(art.b / 1e6).toFixed(0)} MB (o plano gratuito guarda 500 MB em repositório privado)`); }
  for (const p of tenta(() => linhas(`repos/${R}/pulls?state=open&per_page=50`, '.[] | {number, title, created_at}'), [])) if (dias(p.created_at) >= 14) atencao.push(`pull request #${p.number} aberto há ${dias(p.created_at)} dias: "${p.title.slice(0, 60)}"`);
  if (!info.delete_branch_on_merge) notas.push('Apagar a branch ao fazer merge: desligado nas configurações (a limpeza semanal cobre).');

  // páginas no ar
  for (const u of S.paginas || []) { const st = await fetch(u, { signal: AbortSignal.timeout(20000), redirect: 'follow' }).then(r => r.status, () => 0); if (st === 200) notas.push(`Página no ar: ${u}`); else alertas.push(`página fora do ar (${st || 'sem resposta'}): ${u}`); }

  // só no repositório desta pasta: cópia publicada à mão em outro lugar, frescor dos dados da nuvem, contagens e a trava
  if (local) {
    for (const e of S.espelhos || []) {   // { nome, base, arquivos }: o que está no ar é igual ao repositório? Comparar só .js/.css: a hospedagem reescreve o HTML
      const limpo = t => t.replace(/\r/g, '').trim(), diferentes = []; let semResposta = 0;
      for (const arq of e.arquivos || []) {
        const noAr = await fetch(e.base + arq, { signal: AbortSignal.timeout(20000), redirect: 'follow' }).then(r => r.ok ? r.text() : null, () => null), daqui = tenta(() => fs.readFileSync(path.join(RAIZ, arq), 'utf8'), null);
        if (noAr == null) semResposta++; else if (daqui != null && limpo(noAr) !== limpo(daqui)) diferentes.push(arq);
      }
      if (semResposta === (e.arquivos || []).length && semResposta) alertas.push(`${e.nome}: fora do ar ou sem resposta (${e.base})`);
      else if (diferentes.length) atencao.push(`${e.nome}: o que está no ar é diferente do repositório (${diferentes.map(a => '`' + a + '`').join(', ')}): falta publicar, ou publicaram algo que não está aqui`);
      else notas.push(`${e.nome}: no ar e igual ao repositório (${(e.arquivos || []).length} arquivo(s) conferido(s)).`);
    }
    const rastreados = tenta(() => cp.execFileSync('git', ['ls-files', '-z'], { cwd: RAIZ, maxBuffer: 256e6 }).toString('utf8').split('\0').filter(Boolean), []);
    for (const c of S.frescor || []) {
      const data = c.arquivoComData ? tenta(() => (/\d{4}-\d{2}-\d{2}/.exec(fs.readFileSync(path.join(RAIZ, c.arquivoComData), 'utf8')) || [])[0], null) : rastreados.map(f => (new RegExp('^' + c.padrao + '$').exec(f) || [])[1]).filter(Boolean).sort().pop();
      if (!data) alertas.push(`${c.nome}: não achei a data do último dado`);
      else if (diasDaData(data) > c.maxDias) alertas.push(`${c.nome}: o último dado é de ${data.split('-').reverse().join('/')} (há ${diasDaData(data)} dias; o limite é ${c.maxDias})`);
      else notas.push(`${c.nome}: último dado de ${data.split('-').reverse().join('/')}.`);
    }
    for (const c of S.contagemMax || []) { const n = rastreados.filter(f => new RegExp('^' + c.padrao + '$').test(f)).length; if (n > c.max) alertas.push(`${c.nome}: ${n} arquivos (o limite é ${c.max}; o rodízio parou?)`); else notas.push(`${c.nome}: ${n}.`); }
    const trava = ['conferir-repo.js', 'conferir-publico.js'].map(t => path.join(__dirname, t)).find(t => fs.existsSync(t));
    if (trava) { const r = cp.spawnSync(process.execPath, [trava], { cwd: RAIZ, encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: '' } }); if (r.status === 1) alertas.push('a trava do repositório achou problema: ' + (r.stdout.split('\n').filter(l => l.startsWith('- ')).slice(0, 5).join(' | ') || 'ver a saída')); else if (r.status !== 0) atencao.push('a trava do repositório não conseguiu rodar'); else notas.push('Trava do repositório: limpa.'); }
  }
  return { repo: R, privado: info.private, principal, alertas, atencao, notas, tab, apagadas, issuesAbertas: info.open_issues_count };
}

const tabela = (cab, ls) => ls.length ? ['| ' + cab.join(' | ') + ' |', '|' + cab.map(() => '---').join('|') + '|', ...ls.map(l => '| ' + l.map(c => String(c).replace(/\|/g, '/')).join(' | ') + ' |'), ''].join('\n') : '';
function relatorio(r) {
  const quando = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
  return [`## Saúde de ${r.repo} (${r.privado ? 'privado' : 'público'}) · ${quando}`, '',
    `**${r.alertas.length} alerta(s) · ${r.atencao.length} ponto(s) de atenção${r.apagadas.length ? ` · ${r.apagadas.length} branch(es) apagada(s): ${r.apagadas.join(', ')}` : ''}**`, '',
    ...(r.alertas.length ? ['### Alertas', ...r.alertas.map(a => '- ' + a), ''] : []), ...(r.atencao.length ? ['### Atenção', ...r.atencao.map(a => '- ' + a), ''] : []),
    '### Situação', ...r.notas.map(n => '- ' + n), '',
    ...(r.tab.branches.length ? ['### Branches', tabela(['branch', 'situação', 'último commit', 'ação'], r.tab.branches)] : ['### Branches', `Só a \`${r.principal}\`.`, '']),
    ...(r.tab.esteiras.length ? ['### Esteiras', tabela(['esteira', 'estado', 'última rodada no principal', 'agendada', 'falhas seguidas'], r.tab.esteiras)] : []),
    ...(r.tab.minutos.length ? ['### Minutos por esteira', tabela(['esteira', '7 dias', 'por mês (estimado)'], r.tab.minutos)] : [])].join('\n');
}
function issueDeAlerta(r, texto) {   // uma Issue só, com o rótulo saude-automatica: abre/comenta quando há alerta, fecha quando some
  const R = r.repo, aberta = tenta(() => linhas(`repos/${R}/issues?state=open&labels=saude-automatica&per_page=5`, '.[] | select(.pull_request == null) | {number}')[0], null), tmp = path.join(require('os').tmpdir(), `saude-${process.pid}.md`);
  try {
    if (r.alertas.length) {
      fs.writeFileSync(tmp, texto + '\n\n_Aberta e atualizada sozinha pela esteira de saúde. Fecha sozinha quando os alertas somem._\n');
      if (aberta) gh(['issue', 'comment', String(aberta.number), '-R', R, '--body-file', tmp]);
      else { tenta(() => gh(['label', 'create', 'saude-automatica', '-R', R, '--color', 'B60205', '--description', 'Alerta aberto sozinho pela esteira de saúde do repositório', '--force']), null); gh(['issue', 'create', '-R', R, '--title', '[Infra/GitHub] Alerta da auditoria de saúde do repositório', '--label', 'saude-automatica', '--body-file', tmp]); }
    } else if (aberta) { fs.writeFileSync(tmp, `Auditoria de ${br(new Date().toISOString())}: nenhum alerta. Fechando.\n`); gh(['issue', 'comment', String(aberta.number), '-R', R, '--body-file', tmp]); gh(['issue', 'close', String(aberta.number), '-R', R]); }
  } catch (e) { console.log('aviso: não consegui atualizar a Issue de alerta: ' + e.message); } finally { fs.rmSync(tmp, { force: true }); }
}

(async () => {
  const meu = repoLocal();
  if (tem('--todos')) {
    const repos = JSON.parse(gh(['repo', 'list', '--limit', '100', '--json', 'nameWithOwner,isArchived'])).filter(x => !x.isArchived).map(x => x.nameWithOwner).sort(), res = [];
    for (const R of repos) res.push(await auditar(R, R.toLowerCase() === meu.toLowerCase()).catch(e => ({ repo: R, erro: e.message, alertas: [], atencao: [], notas: [], tab: { branches: [], esteiras: [], minutos: [] }, apagadas: [] })));
    if (tem('--json')) return console.log(JSON.stringify(res, null, 1));
    console.log('# Saúde de todos os repositórios da conta\n\n' + tabela(['repositório', 'visibilidade', 'branches além da principal', 'esteiras', 'alertas', 'atenção'], res.map(r => [r.repo, r.erro ? 'erro: ' + r.erro : r.privado ? 'privado' : 'público', r.tab.branches.length, r.tab.esteiras.length, r.alertas.length, r.atencao.length])));
    for (const r of res) if (!r.erro) console.log(relatorio(r) + '\n');
    return;
  }
  const R = valor('--repo') || meu; if (!R) throw new Error('não sei qual é o repositório (use --repo dono/nome)');
  const r = await auditar(R, R.toLowerCase() === meu.toLowerCase()), texto = relatorio(r);
  if (tem('--json')) console.log(JSON.stringify(r, null, 1)); else console.log(texto);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, texto + '\n');
  if (tem('--issue')) issueDeAlerta(r, texto);
  if (process.env.GITHUB_ACTIONS) for (const a of r.alertas) console.log(`::error::${a}`);
  process.exit(r.alertas.length ? 1 : 0);
})().catch(e => { console.error('a auditoria de saúde não conseguiu rodar: ' + e.message); process.exit(2); });
