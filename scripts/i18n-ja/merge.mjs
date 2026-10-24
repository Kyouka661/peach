// 翻訳結果（キー＝原文、値＝訳文の JSON）を辞書 ja.json に取り込む。
// 使い方: node scripts/i18n-ja/merge.mjs <訳文.json>...
// `${...}` の欠落、バッククォートの混入などを確かめ、問題のある訳は取り込まずに表示する。
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './collect.mjs';

const DICT = join(ROOT, 'scripts', 'i18n-ja', 'ja.json');
const dict = JSON.parse(readFileSync(DICT, 'utf8'));

const exprs = s => (s.match(/\$\{[^}]*\}/g) ?? []).sort().join('\n');
const count = (s, ch) => s.split(ch).length - 1;

function problem(src, ja) {
  if (typeof ja !== 'string' || !ja.trim()) return '訳文が空です';
  if (exprs(src) !== exprs(ja)) return '${...} が原文と一致しません';
  if (count(ja, '`') !== count(src, '`')) return 'バッククォートの数が原文と違います';
  if (count(ja, '${') !== count(src, '${')) return '${ の数が原文と違います';
  // 「已删除 」→「削除：」のように、末尾の空白を全角コロンで置き換えるのはよい
  const tailOk = /\s$/.test(src) === /\s$/.test(ja) || (/\s$/.test(src) && ja.endsWith('：'));
  if (/^\s/.test(src) !== /^\s/.test(ja) || !tailOk) return '先頭か末尾の空白が原文と違います';
  return null;
}

let merged = 0;
const rejected = [];
for (const file of process.argv.slice(2)) {
  const part = JSON.parse(readFileSync(file, 'utf8'));
  for (const [src, ja] of Object.entries(part)) {
    if (!(src in dict)) { rejected.push([src, '辞書にない原文です']); continue; }
    const why = problem(src, ja);
    if (why) { rejected.push([src, why]); continue; }
    dict[src] = ja;
    merged++;
  }
}
writeFileSync(DICT, JSON.stringify(dict, null, 2) + '\n');
console.log(`${merged} 件を取り込みました`);
if (rejected.length) {
  console.log(`取り込まなかった訳: ${rejected.length} 件`);
  for (const [src, why] of rejected) console.log(`  ${why}: ${JSON.stringify(src).slice(0, 120)}`);
}
