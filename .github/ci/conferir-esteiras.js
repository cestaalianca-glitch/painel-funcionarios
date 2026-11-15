// PADRÃO DAS ESTEIRAS (governança, 15/11/2026). Confere que todo workflow de .github/workflows segue as regras da casa:
//   1. declara "permissions" no topo (o mínimo necessário) e cada job tem "timeout-minutes" (rodada travada não queima minutos do plano);
//   2. só usa ações oficiais permitidas (governanca.json › esteiras.acoesPermitidas), presas numa versão (@v4...), nunca @main;
//   3. nunca usa pull_request_target (rodaria código de fora com os segredos);
//   4. workflow que usa segredo precisa estar DECLARADO em governanca.json: ou em "producaoSoNoMain" (e então tem a trava de main,
//      o passo com  if: github.ref != 'refs/heads/main'), ou em "segredoSemTravaDeMain", com o motivo escrito;
//   5. sem tabulação (o GitHub recusa) e com name / on / jobs.
// Avisa (sem barrar) quando um texto vindo de fora (inputs, título de PR...) entra direto num comando.
//   node .github/ci/conferir-esteiras.js
const fs = require('fs'), path = require('path');
const DIR = path.resolve(__dirname, '..', 'workflows'), cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'governanca.json'), 'utf8')).esteiras || {};
const PERMITIDAS = cfg.acoesPermitidas || ['actions/'], SO_MAIN = new Set(cfg.producaoSoNoMain || []), SEM_TRAVA = cfg.segredoSemTravaDeMain || {};
const TRAVA_MAIN = "if: github.ref != 'refs/heads/main'";
const erros = [], avisos = [];
const arquivos = fs.readdirSync(DIR).filter(f => /\.ya?ml$/i.test(f)).sort();
for (const arq of arquivos) {
  const txt = fs.readFileSync(path.join(DIR, arq), 'utf8'), linhas = txt.split(/\r?\n/);
  const e = (msg, i) => erros.push(`${arq}${i != null ? ':' + (i + 1) : ''}: ${msg}`);
  if (/\t/.test(txt)) e('tem tabulação (o GitHub só aceita espaços)');
  for (const chave of ['name', 'on', 'jobs', 'permissions']) if (!linhas.some(l => new RegExp('^' + chave + ':').test(l))) e(chave === 'permissions' ? 'falta "permissions:" no topo (declare o mínimo: contents: read)' : `falta "${chave}:" no topo`);
  if (/pull_request_target/.test(txt.replace(/#.*$/gm, ''))) e('usa pull_request_target (proibido: roda código de fora com os segredos)');

  // jobs: bloco de cada job e o timeout
  const iJobs = linhas.findIndex(l => /^jobs:/.test(l)), jobs = [];
  if (iJobs >= 0) for (let i = iJobs + 1; i < linhas.length; i++) {
    if (/^\S/.test(linhas[i]) && !/^#/.test(linhas[i])) break;   // acabou o bloco jobs
    const m = /^  ([A-Za-z0-9_-]+):\s*(#.*)?$/.exec(linhas[i]); if (m) jobs.push({ nome: m[1], ini: i });
  }
  jobs.forEach((j, k) => { j.fim = k + 1 < jobs.length ? jobs[k + 1].ini : linhas.length; if (!linhas.slice(j.ini, j.fim).some(l => /^    timeout-minutes:\s*\d+/.test(l))) e(`job "${j.nome}" sem timeout-minutes`, j.ini); });
  if (iJobs >= 0 && !jobs.length) e('não achei nenhum job');

  // ações usadas
  linhas.forEach((l, i) => {
    const m = /^\s*(?:-\s*)?uses:\s*([^\s#]+)/.exec(l); if (!m) return;
    const acao = m[1].replace(/^['"]|['"]$/g, '');
    if (acao.startsWith('./')) return;
    if (!PERMITIDAS.some(p => acao.startsWith(p))) e(`ação "${acao}" não está na lista permitida (${PERMITIDAS.join(', ')})`, i);
    else if (!/@(v\d+(\.\d+){0,2}|[0-9a-f]{40})$/.test(acao)) e(`ação "${acao}" sem versão fixa (use @v4, por exemplo)`, i);
  });

  // segredos e a trava de produção
  const usaSegredo = /\$\{\{\s*secrets\.(?!GITHUB_TOKEN\b)/.test(txt), temTrava = txt.includes(TRAVA_MAIN);
  if (SO_MAIN.has(arq) && !temTrava) e(`grava em produção e está sem a trava de main (passo com  ${TRAVA_MAIN})`);
  if (usaSegredo && !SO_MAIN.has(arq) && !SEM_TRAVA[arq]) e('usa segredo e não está declarado em governanca.json › esteiras (producaoSoNoMain ou segredoSemTravaDeMain, com o motivo)');
  if (!usaSegredo && SO_MAIN.has(arq)) avisos.push(`${arq}: está em producaoSoNoMain mas não usa segredo (lista desatualizada?)`);

  // texto de fora direto em comando (aviso)
  let emRun = false, recuoRun = 0;
  linhas.forEach((l, i) => {
    const r = /^(\s*)(?:-\s*)?run:\s*(.*)$/.exec(l), recuo = (/^(\s*)/.exec(l) || ['', ''])[1].length;
    if (r) { emRun = true; recuoRun = r[1].length; if (!/\$\{\{\s*(inputs|github\.event|github\.head_ref)/.test(r[2])) return; }
    else if (emRun && l.trim() && recuo <= recuoRun) emRun = false;
    if (emRun && /\$\{\{\s*(inputs\.|github\.event\.(issue|pull_request|comment|head_commit|inputs)|github\.head_ref)/.test(l)) avisos.push(`${arq}:${i + 1}: texto de fora entra direto no comando (prefira passar por env:)`);
  });
}
for (const f of [...SO_MAIN, ...Object.keys(SEM_TRAVA)]) if (!arquivos.includes(f)) avisos.push(`governanca.json cita ${f}, que não existe em .github/workflows`);
console.log(`esteiras: ${arquivos.length} workflow(s) conferido(s)`);
if (avisos.length) { console.log(`\n${avisos.length} aviso(s):\n- ` + avisos.join('\n- ')); if (process.env.GITHUB_ACTIONS) for (const a of avisos) console.log(`::warning::${a}`); }
if (erros.length) { console.log(`\n${erros.length} problema(s):\n- ` + erros.join('\n- ')); if (process.env.GITHUB_ACTIONS) for (const p of erros) console.log(`::error::${p}`); process.exit(1); }
console.log('ok: todos os workflows seguem o padrão da casa');
