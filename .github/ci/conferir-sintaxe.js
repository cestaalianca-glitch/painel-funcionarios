// CHECAGEM DE SINTAXE (governança, 15/11/2026). Em todo push e pull request, confere se cada arquivo rastreado está bem formado.
// Não executa nada do sistema:
//   - .js / .cjs / .mjs: node --check (pega código que nem carrega: chave sobrando, comentário de fim de linha engolindo código...);
//   - .html: cada <script> embutido precisa compilar (página gerada com módulo quebrado fica em branco no celular);
//   - .json / .webmanifest: precisa ser JSON válido;
//   - .sh: bash -n (quando há bash); unidades do systemd (.service / .timer): seção, chave=valor e ExecStart / gatilho de tempo.
//   node .github/ci/conferir-sintaxe.js
const fs = require('fs'), path = require('path'), cp = require('child_process'), vm = require('vm'), os = require('os');
const RAIZ = path.resolve(__dirname, '..', '..');
const arquivos = cp.execFileSync('git', ['ls-files', '-z'], { cwd: RAIZ, maxBuffer: 256e6 }).toString('utf8').split('\0').filter(Boolean).filter(f => fs.existsSync(path.join(RAIZ, f)));
const erros = [], conta = { js: 0, html: 0, scripts: 0, json: 0, sh: 0, systemd: 0 };
const erro = (f, msg, linha) => erros.push({ f, msg: String(msg).trim().split('\n').slice(0, 6).join('\n'), linha });
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

function checaArquivoJs(caminho) {   // devolve a mensagem de erro, ou '' se compila
  return new Promise(ok => cp.execFile(process.execPath, ['--check', caminho], { cwd: RAIZ, maxBuffer: 8e6 }, (e, so, se) => ok(e ? String(se || e.message) : '')));
}
async function checaJs(f) { const m = await checaArquivoJs(path.join(RAIZ, f)); if (m) erro(f, m, +((/:(\d+)\s*$/m.exec(m.split('\n')[0] || '') || [])[1]) || undefined); conta.js++; }
async function emLotes(lista, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, lista.length) }, async () => { while (i < lista.length) await fn(lista[i++]); })); }

async function checaHtml(f) {
  const h = ler(f), re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi; let m;
  while ((m = re.exec(h))) {
    const atributos = m[1], codigo = m[2];
    if (/\bsrc\s*=/i.test(atributos) || !codigo.trim()) continue;
    const tipo = (/\btype\s*=\s*["']?([^"'\s>]+)/i.exec(atributos) || [])[1] || 'text/javascript';
    if (!/^(module|(text|application)\/(javascript|ecmascript))$/i.test(tipo)) continue;   // JSON, modelo, importmap: não é código
    const linha = h.slice(0, m.index).split('\n').length; conta.scripts++;
    if (/^module$/i.test(tipo)) {
      const tmp = path.join(os.tmpdir(), `sintaxe-${process.pid}-${conta.scripts}.mjs`); fs.writeFileSync(tmp, codigo);
      const msg = await checaArquivoJs(tmp); fs.rmSync(tmp, { force: true });
      if (msg) erro(f, `<script type="module"> que começa na linha ${linha} não compila: ${(msg.split('\n').find(l => /Error/.test(l)) || msg).trim()}`, linha);
    } else {
      try { new vm.Script(codigo, { filename: f }); }
      catch (e) { const noBloco = +((/:(\d+)/.exec(String(e.stack).split('\n')[0]) || [])[1]) || 1; erro(f, `<script> que começa na linha ${linha} não compila: ${e.message}`, linha + noBloco - 1); }
    }
  }
  conta.html++;
}
function checaJson(f) { try { JSON.parse(ler(f).replace(/^﻿/, '')); } catch (e) { erro(f, 'JSON inválido: ' + e.message); } conta.json++; }
const temBash = (() => { try { cp.execFileSync('bash', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
function checaSh(f) {
  if (!temBash) return;
  const r = cp.spawnSync('bash', ['-n'], { input: ler(f).replace(/\r/g, ''), encoding: 'utf8' });   // sem \r: no Windows a pasta vem com CRLF
  if (r.status !== 0) erro(f, 'bash -n: ' + (r.stderr || 'erro de sintaxe'));
  conta.sh++;
}
function checaSystemd(f) {
  const secoes = new Set(), chaves = new Set(); let continua = false;
  ler(f).split(/\r?\n/).forEach((l, i) => {
    const t = l.trim(), eraContinuacao = continua; continua = /\\$/.test(t);
    if (!t || /^[#;]/.test(t) || eraContinuacao) return;
    const s = /^\[([A-Za-z]+)\]$/.exec(t); if (s) { secoes.add(s[1]); return; }
    const k = /^([A-Za-z][A-Za-z0-9]*)\s*=/.exec(t); if (k) { chaves.add(k[1]); return; }
    erro(f, 'linha que não é [Seção], chave=valor nem comentário', i + 1);
  });
  if (/\.service$/i.test(f)) { if (!secoes.has('Service')) erro(f, 'falta a seção [Service]'); else if (!chaves.has('ExecStart')) erro(f, 'falta ExecStart='); }
  if (/\.timer$/i.test(f)) { if (!secoes.has('Timer')) erro(f, 'falta a seção [Timer]'); else if (!['OnCalendar', 'OnUnitActiveSec', 'OnBootSec', 'OnActiveSec', 'OnUnitInactiveSec', 'OnStartupSec'].some(k => chaves.has(k))) erro(f, 'falta o gatilho de tempo (OnCalendar= ou On...Sec=)'); }
  conta.systemd++;
}

(async () => {
  await emLotes(arquivos.filter(f => /\.(js|cjs|mjs)$/i.test(f)), 8, checaJs);
  for (const f of arquivos) {
    if (/\.html?$/i.test(f)) await checaHtml(f);
    else if (/\.(json|webmanifest)$/i.test(f)) checaJson(f);
    else if (/\.sh$/i.test(f)) checaSh(f);
    else if (/\.(service|timer)$/i.test(f)) checaSystemd(f);
  }
  console.log(`sintaxe: ${conta.js} .js · ${conta.html} .html (${conta.scripts} script(s) embutido(s)) · ${conta.json} .json · ${conta.sh} .sh${temBash ? '' : ' (sem bash nesta máquina: pulados)'} · ${conta.systemd} unidade(s) do systemd`);
  if (erros.length) {
    erros.sort((a, b) => a.f.localeCompare(b.f));
    console.log(`\n${erros.length} erro(s) de sintaxe:`);
    for (const e of erros) { console.log(`- ${e.f}${e.linha ? ':' + e.linha : ''}: ${e.msg}`); if (process.env.GITHUB_ACTIONS) console.log(`::error file=${e.f}${e.linha ? ',line=' + e.linha : ''}::${e.msg.split('\n')[0]}`); }
    process.exit(1);
  }
  console.log('ok: todos os arquivos estão bem formados');
})().catch(e => { console.error('a checagem de sintaxe não conseguiu rodar: ' + e.message); process.exit(2); });
