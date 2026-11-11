// Pasta do lote e controle.json (estado de cada linha, para retomar de onde parou).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// "~/x" entre aspas não é expandido pelo shell: expande aqui.
const expandir = (v) => (typeof v === 'string' ? v.replace(/^~(?=\/|$)/, os.homedir()) : v);

export function argumentos(argv = process.argv.slice(2)) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { const k = argv[i].slice(2); const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; a[k] = expandir(v); } else (a._ ||= []).push(expandir(argv[i]));
  }
  return a;
}

export const pastas = (lote) => ({
  lote, planilhas: path.join(lote, 'Planilhas'), processos: path.join(lote, 'Processos'),
  textos: path.join(lote, 'textos'), ia: path.join(lote, 'ia'), controle: path.join(lote, 'controle.json'),
});

export function lerControle(lote) {
  const p = pastas(lote).controle;
  if (!fs.existsSync(p)) throw new Error(`não há controle.json em ${lote}: rode o exportar.mjs antes`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function gravarControle(lote, ctl) {
  const p = pastas(lote).controle;
  fs.writeFileSync(`${p}.tmp`, JSON.stringify(ctl, null, 1));
  fs.renameSync(`${p}.tmp`, p);
}

// Nome de pasta/arquivo aceito no Windows e no Mac.
export const nomeSeguro = (s) => String(s ?? '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 150);

// 'dd/mm/aaaa', 'aaaa-mm-ddThh:mm:ss', Date → 'aaaa-mm-dd' (ou '')
export function dataISO(v) {
  if (!v) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return '';
}

export const hojeBR = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
