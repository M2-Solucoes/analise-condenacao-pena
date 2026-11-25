// Passo 0: confere se este computador tem tudo para rodar o robô e instala o que faltar, ANTES de cada execução.
//   node scripts/preparar.mjs                    (verifica e instala)
//   node scripts/preparar.mjs --so-verificar     (só verifica; não instala nada)
//   opções: --base <pasta dos lotes>  --monitorados <xlsx da lista da Vivo>
//
// O que confere e o que faz quando falta:
//   1. Node 20 ou mais novo .......... não se instala sozinho (este script já roda no Node): diz o comando
//   2. Pacotes do robô ............... npm ci (puppeteer-core e exceljs, nas versões do package-lock)
//   3. pdftotext (Poppler) ........... Mac: brew install poppler · Windows: winget · Linux: diz o comando
//   4. Google Chrome ................. Mac: brew install --cask google-chrome · Windows: winget · Linux: diz o comando
//   5. Pasta dos lotes ............... cria
//   6. Lista de monitorados da Vivo .. só confere (o arquivo vem da Vivo; ninguém o inventa)
//   7. eLaw ao alcance ............... só confere, como aviso (o login continua sendo da pessoa)
// Sem o pdftotext o robô não para: trata toda decisão como digitalizada e a análise piora sem aviso. Por isso
// este passo é obrigatório.
// Sai com 0 quando está tudo pronto e com 1 quando falta algo que precisa de uma pessoa (o motivo vem escrito).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIN = process.platform === 'win32';
const MAC = process.platform === 'darwin';
const NOME_LISTA = 'RELATÓRIO SIMPLES ADVOGADOS MONITORADOS NACIONAL.xlsx';

const a = {};
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i];
  if (!k.startsWith('--')) continue;
  const v = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true;
  a[k.slice(2)] = typeof v === 'string' ? v.replace(/^~(?=\/|\\|$)/, os.homedir()) : v;
}
const SO_VERIFICAR = !!a['so-verificar'];

const faltas = [];
const avisos = [];
const instalados = [];
const ok = (t) => console.log(`✔ ${t}`);
const falta = (t, oQueFazer) => { console.log(`✖ ${t}${oQueFazer ? ` — ${oQueFazer}` : ''}`); faltas.push(`${t}${oQueFazer ? `: ${oQueFazer}` : ''}`); };
const aviso = (t) => { console.log(`! ${t}`); avisos.push(t); };

// roda um comando mostrando a saída; devolve true se terminou bem
function rodar(cmd, args, opcoes = {}) {
  console.log(`  → ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: WIN, ...opcoes });
  return !r.error && r.status === 0;
}
// o comando existe? (pdftotext -v sai com 0 ou 99, conforme a versão)
function existe(cmd, args = ['--version']) {
  const r = spawnSync(cmd, args, { stdio: 'ignore', shell: WIN });
  return !r.error && (r.status === 0 || r.status === 99);
}
function acharBrew() {
  if (existe('brew')) return 'brew';
  return ['/opt/homebrew/bin/brew', '/usr/local/bin/brew'].find((p) => fs.existsSync(p)) || null;
}
const temWinget = () => WIN && existe('winget');
const WINGET = ['--exact', '--silent', '--accept-source-agreements', '--accept-package-agreements'];

console.log(`Preparando o computador para o robô de análise da condenação${SO_VERIFICAR ? ' (só verificação)' : ''}…`);

// 1. Node
const major = Number(process.versions.node.split('.')[0]);
if (major >= 20) ok(`Node ${process.versions.node}`);
else falta(`Node ${process.versions.node} (precisa do 20 ou mais novo)`, MAC ? 'rode `brew install node`' : WIN ? 'rode `winget install --id OpenJS.NodeJS.LTS --exact`' : 'instale o Node 20 LTS pelo gerenciador do sistema');

// 2. Pacotes do robô
const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'));
function pacotesOk() {
  const lock = path.join(RAIZ, 'package-lock.json');
  const marca = path.join(RAIZ, 'node_modules', '.package-lock.json');
  for (const [nome, versao] of Object.entries(pkg.dependencies || {})) {
    const f = path.join(RAIZ, 'node_modules', nome, 'package.json');
    if (!fs.existsSync(f)) return `${nome} não instalado`;
    const v = JSON.parse(fs.readFileSync(f, 'utf8')).version;
    if (v !== versao) return `${nome} ${v} instalado, mas o robô usa ${versao}`;
  }
  if (fs.existsSync(lock) && fs.existsSync(marca) && fs.statSync(lock).mtimeMs > fs.statSync(marca).mtimeMs + 1000) return 'package-lock mais novo que a instalação';
  return '';
}
let motivo = pacotesOk();
if (motivo && !SO_VERIFICAR) {
  console.log(`↻ Pacotes do robô: ${motivo}. Instalando…`);
  const npmArgs = [fs.existsSync(path.join(RAIZ, 'package-lock.json')) ? 'ci' : 'install', '--no-audit', '--no-fund'];
  if (rodar('npm', npmArgs, { cwd: RAIZ })) { instalados.push('pacotes do robô (npm)'); motivo = pacotesOk(); }
}
if (!motivo) ok(`Pacotes do robô (${Object.entries(pkg.dependencies).map(([n, v]) => `${n} ${v}`).join(', ')})`);
else falta(`Pacotes do robô: ${motivo}`, `rode \`npm ci\` na pasta ${RAIZ}`);

// 3. pdftotext
const temPdftotext = () => existe('pdftotext', ['-v']);
if (!temPdftotext() && !SO_VERIFICAR) {
  console.log('↻ pdftotext (Poppler) não encontrado. Instalando…');
  const brew = MAC && acharBrew();
  if (brew && rodar(brew, ['install', 'poppler'])) instalados.push('Poppler (pdftotext)');
  else if (temWinget() && rodar('winget', ['install', '--id', 'oschwartz10612.Poppler', ...WINGET])) instalados.push('Poppler (pdftotext)');
}
if (temPdftotext()) ok('pdftotext (Poppler)');
else if (instalados.includes('Poppler (pdftotext)')) falta('pdftotext instalado, mas fora do PATH', 'abra um terminal novo; no Windows, inclua a pasta bin do Poppler no PATH');
else falta('pdftotext (Poppler)', MAC ? (acharBrew() ? 'rode `brew install poppler`' : 'instale o Homebrew (https://brew.sh) e rode `brew install poppler`') : WIN ? 'rode `winget install --id oschwartz10612.Poppler --exact`' : 'rode `sudo apt-get install poppler-utils`');

// 4. Google Chrome (o mesmo caminho que o robô usa para abrir a janela)
async function caminhoChrome() {
  try {
    const b = await import('@puppeteer/browsers');
    return b.computeSystemExecutablePath({ browser: b.Browser.CHROME, platform: b.detectBrowserPlatform(), channel: b.ChromeReleaseChannel.STABLE });
  } catch { return null; }
}
let chrome = await caminhoChrome();
if (!chrome && !SO_VERIFICAR) {
  console.log('↻ Google Chrome não encontrado. Instalando…');
  const brew = MAC && acharBrew();
  if (brew && rodar(brew, ['install', '--cask', 'google-chrome'])) instalados.push('Google Chrome');
  else if (temWinget() && rodar('winget', ['install', '--id', 'Google.Chrome', ...WINGET])) instalados.push('Google Chrome');
  chrome = await caminhoChrome();
}
if (chrome) ok(`Google Chrome (${chrome})`);
else falta('Google Chrome', MAC ? 'rode `brew install --cask google-chrome` ou instale pelo site do Google' : WIN ? 'rode `winget install --id Google.Chrome --exact`' : 'instale o Google Chrome estável pelo site do Google');

// 5. Pasta dos lotes
const base = path.resolve(a.base || path.join(os.homedir(), 'Projetos Claude', 'Análise de Condenações'));
const pastaLista = path.join(base, '_lista-monitorados');
if (!fs.existsSync(pastaLista) && !SO_VERIFICAR) { fs.mkdirSync(pastaLista, { recursive: true }); instalados.push(`pasta ${pastaLista}`); }
if (fs.existsSync(base)) {
  try { fs.accessSync(base, fs.constants.W_OK); ok(`Pasta dos lotes (${base})`); } catch { falta(`Pasta dos lotes sem permissão de gravação (${base})`, 'escolha outra pasta com --base'); }
} else falta(`Pasta dos lotes (${base})`, 'rode sem --so-verificar para criar');

// 6. Lista de monitorados
const arqLista = path.resolve(a.monitorados || path.join(pastaLista, NOME_LISTA));
if (!fs.existsSync(arqLista)) falta(`Lista de monitorados da Vivo (${arqLista})`, `peça à equipe a planilha "${NOME_LISTA}" e grave nesse caminho`);
else if (!motivo) {
  try {
    const { carregarLista } = await import('./lib/monitorados.mjs');
    const lista = await carregarLista(arqLista);
    ok(`Lista de monitorados da Vivo (${lista.length} advogados, ${lista.filter((x) => x.ativo).length} ativos)`);
  } catch (e) { falta(`Lista de monitorados ilegível (${arqLista})`, e.message); }
} else aviso('Lista de monitorados encontrada, mas não lida (faltam os pacotes do robô)');

// 7. eLaw ao alcance (só aviso: sem internet o robô para no passo 1 e diz)
try {
  await fetch('https://penacarvalho.elawio.com.br', { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(10000) });
  ok('eLaw ao alcance (o login continua sendo da pessoa)');
} catch (e) { aviso(`eLaw fora do alcance agora (${e.cause?.code || e.name}): confira a internet antes de abrir a janela`); }

console.log('');
if (instalados.length) console.log(`Instalado agora: ${instalados.join('; ')}.`);
if (avisos.length) console.log(`Avisos: ${avisos.length}.`);
if (faltas.length) {
  console.log(`FALTA ${faltas.length} item(ns) — o robô não deve rodar até resolver:`);
  for (const f of faltas) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('PRONTO: o computador tem tudo para rodar o robô.');
