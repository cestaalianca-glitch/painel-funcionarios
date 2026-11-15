// LIGA OS GANCHOS DO GIT NESTA CÓPIA DO REPOSITÓRIO (governança, 15/11/2026). Os ganchos ficam em .github/ganchos (rastreados no git):
//   pre-commit  roda a trava no que está preparado para o commit;
//   pre-push    roda a trava no conteúdo exato de cada commit antes de sair para o GitHub.
// É uma configuração LOCAL (git config core.hooksPath): vale só para esta pasta e precisa ser ligada uma vez em cada computador.
//   node .github/ci/instalar-ganchos.js              liga
//   node .github/ci/instalar-ganchos.js --desligar   desliga (volta ao padrão do git)
//   node .github/ci/instalar-ganchos.js --estado     só mostra se está ligado
const cp = require('child_process'), fs = require('fs'), path = require('path');
const RAIZ = path.resolve(__dirname, '..', '..'), PASTA = '.github/ganchos';
const git = a => cp.execFileSync('git', a, { cwd: RAIZ, encoding: 'utf8' }).trim();
const atual = () => { try { return git(['config', '--local', '--get', 'core.hooksPath']); } catch { return ''; } };
if (process.argv.includes('--estado')) { console.log(atual() === PASTA ? `ganchos LIGADOS (${PASTA})` : `ganchos desligados${atual() ? ' (core.hooksPath = ' + atual() + ')' : ''}`); process.exit(0); }
if (process.argv.includes('--desligar')) { if (atual()) git(['config', '--local', '--unset', 'core.hooksPath']); console.log('ganchos desligados nesta cópia do repositório (a esteira do GitHub continua conferindo)'); process.exit(0); }
if (atual() && atual() !== PASTA) { console.error(`core.hooksPath já aponta para "${atual()}": não mexi. Desligue antes com --desligar se quiser trocar.`); process.exit(1); }
for (const g of ['pre-commit', 'pre-push']) { const f = path.join(RAIZ, PASTA, g); if (!fs.existsSync(f)) { console.error('não achei ' + PASTA + '/' + g); process.exit(1); } try { fs.chmodSync(f, 0o755); } catch {} if (/\r\n/.test(fs.readFileSync(f, 'utf8'))) fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')); }
git(['config', '--local', 'core.hooksPath', PASTA]);
console.log(`ganchos LIGADOS nesta cópia do repositório (${PASTA}): todo commit e todo envio passam pela trava antes de sair.`);
