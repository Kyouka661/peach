// フロントエンドのソースから、中国語（漢字）を含む文字列リテラルと JSX テキストを
// 構文木（oxc-parser）で拾う。コメントと正規表現リテラルは対象外。
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(join(ROOT, 'frontend', 'package.json'));
const { parseSync } = require('oxc-parser');

export const TARGET_DIRS = ['frontend/src', 'frontend/test', 'frontend/e2e'];
const EXTS = new Set(['.ts', '.tsx', '.js', '.mjs']);
export const HAN = /[㐀-鿿]/;

export function listFiles() {
  const out = [];
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules') continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (EXTS.has(extname(name)) && !name.endsWith('.d.ts')) out.push(path);
    }
  };
  for (const dir of TARGET_DIRS) walk(join(ROOT, dir));
  return out.sort();
}

// 置換済みのソースから抽出・置換すると訳文を原文と取り違えるので、未変更のときだけ動かす
export function requireCleanSource() {
  const dirty = execFileSync('git', ['status', '--porcelain', '--', ...TARGET_DIRS, 'web/index.html'], { cwd: ROOT, encoding: 'utf8' });
  if (dirty.trim()) {
    console.error('フロントエンドのソースに変更があります。先に元に戻してください:');
    console.error('  git checkout -- frontend/src frontend/test frontend/e2e web/index.html web/dist');
    process.exit(1);
  }
}

export function rel(path) {
  return relative(ROOT, path).replaceAll('\\', '/');
}

const isRegExpCall = n => (n.type === 'NewExpression' || n.type === 'CallExpression')
  && n.callee?.type === 'Identifier' && n.callee.name === 'RegExp';

const MODULE_SOURCE = new Set(['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression']);

// 1 ファイル分の置換単位を返す。オフセットは UTF-16（JS の文字列添字と同じ）。
// kind: 'string'（値で照合）| 'template'（`` ` `` の中身を原文のまま照合）| 'jsx'（前後の空白を除いて照合）
export function collect(path) {
  const text = readFileSync(path, 'utf8');
  const { program, errors } = parseSync(path, text, { lang: extname(path) === '.tsx' ? 'tsx' : extname(path) === '.ts' ? 'ts' : 'jsx' });
  if (errors.length) throw new Error(`${rel(path)}: 構文解析に失敗しました: ${errors[0].message}`);
  const units = [];
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);
  const lineOf = pos => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= pos) lo = mid; else hi = mid - 1; }
    return lo + 1;
  };
  const add = (kind, key, start, end, extra = {}) =>
    units.push({ kind, key, start, end, line: lineOf(start), ...extra });

  // TemplateElement の位置は、JS では区切り（` や ${ や }）を含まず、TS では含む。原文の位置で合わせる
  const templatePart = q => {
    const raw = q.value.raw;
    const s = text.startsWith(raw, q.start) && q.end - q.start === raw.length ? q.start : q.start + 1;
    if (!text.startsWith(raw, s)) throw new Error(`${rel(path)}: テンプレートの位置を特定できません: ${raw}`);
    if (HAN.test(raw)) add('template', raw, s, s + raw.length);
  };

  const visit = (node, parent) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const n of node) visit(n, parent); return; }
    if (typeof node.type !== 'string') return;
    switch (node.type) {
      case 'Literal':
        if (typeof node.value === 'string' && !node.regex && HAN.test(node.value)
            && !isRegExpCall(parent) && !(MODULE_SOURCE.has(parent?.type) && parent.source === node)) {
          // prop: `{ confirmation: '…' }` のようにオブジェクトの値になっているときのキー名
          const prop = parent?.type === 'Property' && parent.value === node ? parent.key?.name ?? parent.key?.value ?? null : null;
          add('string', node.value, node.start, node.end,
            { quote: text[node.start], jsxAttr: parent?.type === 'JSXAttribute', prop });
        }
        return;
      case 'TemplateLiteral': {
        const raw = text.slice(node.start + 1, node.end - 1);
        if (!HAN.test(raw)) return;
        const innerHan = node.expressions.some(e => HAN.test(text.slice(e.start, e.end)));
        if (!innerHan) { add('template', raw, node.start + 1, node.end - 1); return; }
        // 埋め込み式の中にも中国語がある：文字列部分を個別に扱い、式の中へ降りる
        node.quasis.forEach(templatePart);
        for (const e of node.expressions) visit(e, node);
        return;
      }
      case 'JSXText': {
        const raw = text.slice(node.start, node.end);
        const core = raw.trim();
        if (HAN.test(core)) {
          const s = node.start + raw.indexOf(core);
          add('jsx', core, s, s + core.length);
        }
        return;
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end') continue;
      const v = node[key];
      if (v && typeof v === 'object') visit(v, node);
    }
  };
  visit(program, null);
  return { text, units };
}
