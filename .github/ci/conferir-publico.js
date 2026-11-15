// TRAVA DA LINHA PÚBLICA (Bloco 19, 14/11/2026; ampliada na governança de 15/11/2026). Este repositório é PÚBLICO: tudo que entra aqui
// fica visível na internet, mesmo antes de publicar a página. A trava confere que nada rastreado tem:
//   - arquivo .bak-*, arquivo de segredo (.env, chave, credencial), sessão de WhatsApp/navegador, lista, conversa ou comprovante;
//   - planilha, CSV, PDF, áudio, vídeo ou pacote (dado de cliente não mora em repositório público);
//   - chave secreta (Supabase de serviço, GitHub, Anthropic, Google, AWS...) ou chave JWT que não seja a pública (anon);
//   - dado de cliente/financeiro escrito na página: CPF, telefone, valor em reais, número de pedido do site ou e-mail.
// Os dados reais só chegam pelo Supabase depois do login (o que a chave pública lê é decidido pelo RLS).
// Falhou = o build para e a página continua na versão anterior. Nunca imprime o valor achado (só o tipo, o arquivo e a linha).
//   node .github/ci/conferir-publico.js                  arquivos rastreados, como estão na pasta (esteira do GitHub)
//   node .github/ci/conferir-publico.js --indice         o que está preparado para o commit (gancho pre-commit)
//   node .github/ci/conferir-publico.js --commit <sha>   o conteúdo exato de um commit (gancho pre-push)
// Exceções conhecidas e justificadas, em .github/ci/permitidos.json:
//   { "trechos": [{ "texto": "...", "porque": "..." }],     trecho exato liberado (ex.: o telefone da própria empresa)
//     "tiposLiberados": { "valor em reais": "porque" },     tipo inteiro liberado neste repositório (ex.: preço no site de vendas)
//     "arquivosLiberados": ["catalogo.pdf"] }               arquivo de dado/pacote liberado
// Sai com 0 (limpo), 1 (achou problema) ou 2 (a trava não conseguiu rodar; os ganchos locais liberam e a esteira confere de novo).
const fs = require('fs'), path = require('path'), cp = require('child_process');
const RAIZ = path.resolve(__dirname, '..', '..');
const arg = process.argv.slice(2), iCommit = arg.indexOf('--commit');
const MODO = iCommit >= 0 ? 'commit' : arg.includes('--indice') ? 'indice' : 'pasta', SHA = iCommit >= 0 ? arg[iCommit + 1] : null;

function principal() {
  if (MODO === 'commit' && !/^[0-9a-f]{7,64}$/i.test(SHA || '')) throw new Error('uso: --commit <sha>');
  const perm = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'permitidos.json'), 'utf8')); } catch { return {}; } })();
  const trechos = (perm.trechos || []).map(x => x.texto).filter(Boolean), tiposLivres = new Set(Object.keys(perm.tiposLiberados || {})), arqLivres = new Set(perm.arquivosLiberados || []);
  const git = a => cp.execFileSync('git', a, { cwd: RAIZ, maxBuffer: 1024e6 });
  const linhasZ = a => git(a).toString('utf8').split('\0').filter(Boolean);

  // 1) o que conferir
  let itens;
  if (MODO === 'pasta') itens = linhasZ(['ls-files', '-z']).map(f => ({ f }));
  else if (MODO === 'indice') itens = linhasZ(['ls-files', '-s', '-z']).map(l => { const [meta, f] = l.split('\t'), [modo, sha] = meta.split(' '); return { f, sha, modo }; }).filter(e => e.modo !== '160000');
  else itens = linhasZ(['ls-tree', '-r', '-l', '-z', SHA]).map(l => { const [meta, f] = l.split('\t'), [, tipo, sha, tam] = meta.split(/ +/); return { f, sha, tipo, tam: +tam }; }).filter(e => e.tipo === 'blob');
  if (MODO === 'pasta') for (const e of itens) { try { e.tam = fs.statSync(path.join(RAIZ, e.f)).size; } catch { e.tam = null; } }
  if (MODO === 'indice') {
    const r = cp.spawnSync('git', ['cat-file', '--batch-check'], { cwd: RAIZ, input: itens.map(e => e.sha).join('\n') + '\n', maxBuffer: 256e6, encoding: 'utf8' });
    const tam = new Map(); for (const l of (r.stdout || '').split('\n')) { const p = l.split(' '); if (p.length === 3) tam.set(p[0], +p[2]); }
    for (const e of itens) e.tam = tam.has(e.sha) ? tam.get(e.sha) : null;
  }

  // 2) regras pelo NOME do arquivo
  const NOMES = [
    [/\.bak(-|_|\.|$)/i, 'arquivo .bak rastreado (backup nunca vai para o público)'],
    [/(^|\/)\.env(\.|$)/i, 'arquivo de segredo (.env) rastreado'],
    [/\.(pem|key|p12|pfx|ppk|jks|keystore)$/i, 'arquivo de chave rastreado'],
    [/(^|\/)(id_rsa|id_ed25519|id_ecdsa)(\.|$)/i, 'chave SSH rastreada'],
    [/(^|\/)(client_secret|credentials|service[-_]?account|token)[^/]*\.json$/i, 'credencial ou token em arquivo rastreado'],
    [/(^|\/)(\.wwebjs_auth|\.wwebjs_cache|auth_info[^/]*|sess(ao|oes|ions?)[^/]*|tokens|perfil[^/]*|perfis|user-?data[^/]*|chrome-?profile[^/]*|browser-?data[^/]*)\//i, 'sessão de WhatsApp ou de navegador rastreada'],
    [/(^|\/)(listas[^/]*|conversas|atendimento|comprovantes[^/]*|analise-credito|backups-locais|logs)\//i, 'pasta com dado de cliente rastreada'],
    [/\.(csv|tsv|xlsx?|xlsm|ods|vcf|sqlite3?|db|mdb|zip|rar|7z|gz|tar|pdf|docx?|ogg|opus|mp3|m4a|wav|mp4|mov)$/i, 'planilha, PDF, áudio, vídeo ou pacote rastreado (dado não mora em repositório público; exceção em permitidos.json › arquivosLiberados)'],
  ];
  const problemas = [];
  for (const { f } of itens) { if (arqLivres.has(f)) continue; const regra = NOMES.find(([re]) => re.test(f)); if (regra) problemas.push(`${f}: ${regra[1]}`); }

  // 3) regras pelo CONTEÚDO (texto até 5 MB; os scripts da própria trava ficam de fora porque trazem os padrões escritos)
  const TEXTO = /\.(html?|js|mjs|cjs|ts|css|json|txt|md|svg|xml|webmanifest|ya?ml|sh|toml|sql|bat|cmd|vbs|ps1|py|ini|conf)$/i, IGNORA = /^\.github\/ci\//, GRANDE = 5e6;
  const alvo = itens.filter(e => (TEXTO.test(e.f) || !/\.[a-z0-9]+$/i.test(e.f)) && !IGNORA.test(e.f) && e.tam != null && e.tam <= GRANDE && !problemas.some(p => p.startsWith(e.f + ':')));
  const conteudo = new Map();
  if (MODO === 'pasta') for (const e of alvo) { try { conteudo.set(e.f, fs.readFileSync(path.join(RAIZ, e.f), 'utf8')); } catch {} }
  else if (alvo.length) {
    const r = cp.spawnSync('git', ['cat-file', '--batch'], { cwd: RAIZ, input: alvo.map(e => e.sha).join('\n') + '\n', maxBuffer: 1024e6 });
    if (r.status !== 0) throw new Error('git cat-file falhou');
    const b = r.stdout, porSha = new Map(); let p = 0;
    while (p < b.length) { const nl = b.indexOf(10, p); if (nl < 0) break; const cab = b.slice(p, nl).toString('utf8').split(' '); if (cab.length !== 3) { p = nl + 1; continue; } const n = +cab[2]; porSha.set(cab[0], b.slice(nl + 1, nl + 1 + n).toString('utf8')); p = nl + 1 + n + 1; }
    for (const e of alvo) if (porSha.has(e.sha)) conteudo.set(e.f, porSha.get(e.sha));
  }
  const PADROES = [
    ['CPF', /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g],
    ['CPF ou telefone sem pontuação', /(?<![\w.$#-])\d{11}(?![\w.])/g],
    ['telefone celular', /\(?\b[1-9]{2}\)?[\s.-]?9\d{4}[\s.-]?\d{4}\b/g],
    ['telefone fixo', /\(\d{2}\)\s?[2-5]\d{3}-\d{4}\b/g],
    ['valor em reais', /R\$\s?\d[\d.]*(,\d{2})?/g],
    ['número de pedido do site', /\bS\d{6}-\d{3}\b/g],
    ['e-mail', /\b[\w.+-]+@[\w-]+\.[a-z]{2,}(\.[a-z]{2,})?\b/gi],
    ['chave secreta do Supabase', /\bsb_secret_[\w-]{8,}/g],
    ['token pessoal do Supabase', /\bsbp_[a-f0-9]{40}\b/g],
    ['chave privada', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
    ['token do GitHub', /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/g],
    ['chave da Anthropic', /\bsk-ant-[\w-]{20,}/g],
    ['chave da OpenAI', /\bsk-(proj-)?[A-Za-z0-9_-]{32,}\b/g],
    ['chave do Google', /\bAIza[\w-]{35}\b/g],
    ['chave da AWS', /\bAKIA[0-9A-Z]{16}\b/g],
    ['token da Netlify', /\bnfp_[A-Za-z0-9]{30,}\b/g],
    ['senha dentro de endereço (usuario:senha@)', /\b[a-z][a-z0-9+.-]{2,}:\/\/[^\s:@/'"`<>]+:[^\s:@/'"`<>${}]{4,}@[\w.-]+/gi],
  ];
  const mascara = s => String(s).slice(0, 2) + '…(' + String(s).length + ')';
  for (const [f, txt] of conteudo) txt.split(/\r?\n/).forEach((l, i) => {
    for (const [tipo, re] of PADROES) { if (tiposLivres.has(tipo)) continue; for (const m of l.matchAll(re)) { if (trechos.some(p => l.includes(p) && p.includes(m[0]))) continue; problemas.push(`${f}:${i + 1}: ${tipo} ${mascara(m[0])}`); } }
    for (const m of l.matchAll(/eyJ[\w-]{10,}\.(eyJ[\w-]{10,})\.[\w-]+/g)) {   // JWT: só a chave pública (anon) pode aparecer; a de serviço nunca
      let papel = ''; try { papel = JSON.parse(Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()).role || ''; } catch { papel = '?'; }
      if (papel !== 'anon') problemas.push(`${f}:${i + 1}: chave JWT com papel "${papel}" (só a anon é pública)`);
    }
  });

  const oque = MODO === 'pasta' ? 'linha pública' : MODO === 'indice' ? 'preparado para o commit' : 'commit ' + SHA.slice(0, 7);
  console.log(`${oque}: ${itens.length} arquivo(s) rastreado(s), ${conteudo.size} lido(s)`);
  if (problemas.length) {
    console.log(`\n${problemas.length} problema(s):\n- ` + problemas.join('\n- '));
    if (process.env.GITHUB_ACTIONS) for (const p of problemas.slice(0, 50)) console.log(`::error::${p}`);
    return 1;
  }
  console.log('ok: nenhum .bak, segredo, arquivo de dado ou dado de cliente na linha pública');
  return 0;
}

let codigo;
try { codigo = principal(); } catch (e) { console.error('a trava não conseguiu rodar: ' + e.message); codigo = 2; }
process.exit(codigo);
