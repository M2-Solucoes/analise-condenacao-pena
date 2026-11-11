// Sessão do Chrome usada pelo robô. O Chrome é aberto pelo `sessao.mjs abrir`, com perfil próprio fora do
// repositório; a pessoa faz o login do eLaw nessa janela. Os outros scripts se conectam a ele pelo endereço
// gravado em ws.txt. O perfil guarda cookies de sessão: não copiar nem versionar.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const ELAW = 'https://penacarvalho.elawio.com.br';
export const PERFIL = path.join(os.homedir(), '.cache', 'analise-condenacao-chrome');
export const ARQ_WS = path.join(PERFIL, 'ws.txt');
export const ARQ_PARAR = path.join(PERFIL, 'parar');

export const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export class SessaoCaiu extends Error {
  constructor(msg = 'a sessão do eLaw caiu: faça o login de novo na janela do robô') { super(msg); this.code = 'SESSAO'; }
}

export async function abrirChrome() {
  fs.mkdirSync(PERFIL, { recursive: true });
  fs.rmSync(ARQ_PARAR, { force: true });
  const browser = await puppeteer.launch({
    headless: false, channel: 'chrome', defaultViewport: null, userDataDir: PERFIL,
    args: ['--window-size=1500,950'],
  });
  fs.writeFileSync(ARQ_WS, browser.wsEndpoint());
  return browser;
}

// Conecta no Chrome aberto e devolve uma aba do eLaw (abre uma se não houver).
export async function conectar() {
  if (!fs.existsSync(ARQ_WS)) throw new Error('o Chrome do robô não está aberto: rode `node scripts/sessao.mjs abrir`');
  let browser;
  try {
    browser = await puppeteer.connect({ browserWSEndpoint: fs.readFileSync(ARQ_WS, 'utf8').trim(), defaultViewport: null });
  } catch {
    throw new Error('não consegui falar com o Chrome do robô (fechado?): rode `node scripts/sessao.mjs abrir` de novo');
  }
  const pages = await browser.pages();
  let page = pages.find((p) => /elawio\.com\.br/.test(p.url())) || pages[0];
  if (!page) page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 860, deviceScaleFactor: 1 });
  return { browser, page };
}

export async function estaLogado(page) {
  if (!/penacarvalho\.elawio\.com\.br/.test(page.url()) || /Auth\/Login/i.test(page.url())) {
    await page.goto(`${ELAW}/telainicial`, { waitUntil: 'networkidle2', timeout: 60_000 });
  }
  return !!(await page.$('li.current-user'));
}

export async function garantirLogado(page) {
  if (!(await estaLogado(page))) throw new SessaoCaiu();
}
