// VERSÃO LIMPA DO SITE (Bloco 19, 14/11/2026; generalizada na governança de 15/11/2026). Copia para _site/ só o que é página (HTML, JS,
// CSS, imagens, fontes, manifest, robots.txt e .nojekyll) dos arquivos rastreados no git. Fica de fora: .github/, .claude/, documentação
// (*.md), backup (.bak-*) e qualquer outro arquivo. É o que vira a prévia baixável e, onde a esteira publica, o pacote do GitHub Pages.
// Em .github/ci/governanca.json › site: "obrigatorios" são as páginas que não podem faltar; "tambem" são arquivos de outro tipo que a
// página usa em tempo de execução (por exemplo, um modelo de planilha) e precisam ir junto.
//   node .github/ci/montar-site.js
const fs = require('fs'), path = require('path'), cp = require('child_process');
const RAIZ = path.resolve(__dirname, '..', '..'), SAIDA = path.join(RAIZ, '_site');
const cfg = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'governanca.json'), 'utf8')).site || {}; } catch { return {}; } })();
const OBRIGATORIOS = cfg.obrigatorios || ['index.html'], TAMBEM = new Set(cfg.tambem || []);
const PERMITE = /\.(html?|js|css|png|jpe?g|gif|svg|ico|webp|avif|woff2?|json|webmanifest|txt|xml)$/i;
const arquivos = cp.execFileSync('git', ['ls-files', '-z'], { cwd: RAIZ, maxBuffer: 256e6 }).toString('utf8').split('\0').filter(Boolean);
fs.rmSync(SAIDA, { recursive: true, force: true }); fs.mkdirSync(SAIDA, { recursive: true });
let n = 0, bytes = 0; const fora = [];
for (const f of arquivos) {
  const ok = (f === '.nojekyll' || PERMITE.test(f) || TAMBEM.has(f)) && !/^\.(github|claude)\//.test(f) && !/\.bak(-|_|\.|$)/i.test(f) && !/(^|\/)CLAUDE\.md$/i.test(f) && !/(^|\/)\.env/.test(f) && fs.existsSync(path.join(RAIZ, f));
  if (!ok) { fora.push(f); continue; }
  fs.mkdirSync(path.dirname(path.join(SAIDA, f)), { recursive: true }); fs.copyFileSync(path.join(RAIZ, f), path.join(SAIDA, f)); n++; bytes += fs.statSync(path.join(SAIDA, f)).size;
}
const faltando = OBRIGATORIOS.filter(f => !fs.existsSync(path.join(SAIDA, f)));
if (faltando.length) { console.log(`::error::não entrou na versão limpa: ${faltando.join(', ')}`); process.exit(1); }
console.log(`versão limpa: ${n} arquivo(s), ${(bytes / 1e6).toFixed(2)} MB em _site/` + (fora.length ? ` · fora da publicação: ${fora.length} arquivo(s) (${fora.slice(0, 8).join(', ')}${fora.length > 8 ? '…' : ''})` : ''));
