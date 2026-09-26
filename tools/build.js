#!/usr/bin/env node
// 한 파일짜리 빌드를 만든다.
//   docs/index.html      : 그대로 열 수 있는 독립 실행 페이지 (GitHub Pages 용)
//   build/artifact.html  : Claude 아티팩트 게시용 (doctype·head 없이 본문만)
// 폰트는 게임에서 쓰는 글자만 남겨 서브셋한다 (pyftsubset 이 있으면).
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const GAME = path.join(ROOT, 'game');
const read = (p) => fs.readFileSync(p, 'utf8');

const html = read(path.join(GAME, 'index.html'));
const between = (a, b) => {
  const i = html.indexOf(a);
  const j = html.indexOf(b);
  if (i < 0 || j < 0) throw new Error('marker missing: ' + a);
  return html.slice(i + a.length, j).trim();
};
const title = between('<!-- TITLE START -->', '<!-- TITLE END -->');
const body = between('<!-- BODY START -->', '<!-- BODY END -->');
const scripts = [...between('<!-- SCRIPTS START -->', '<!-- SCRIPTS END -->').matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
const jsSources = scripts.map((s) => ({ name: s, code: read(path.join(GAME, s)) }));
let css = read(path.join(GAME, 'style.css'));

// ── 폰트 서브셋 ──
const fontPath = path.join(GAME, 'assets/fonts/Galmuri11.woff2');
const chars = new Set();
for (let c = 0x20; c < 0x7f; c++) chars.add(String.fromCharCode(c));
for (const src of [html, css, ...jsSources.map((s) => s.code)]) for (const ch of src) if (ch.charCodeAt(0) >= 0x80) chars.add(ch);
const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'rs-build-'));
const textFile = path.join(tmp, 'chars.txt');
fs.writeFileSync(textFile, [...chars].join(''));
let fontData;
try {
  const out = path.join(tmp, 'sub.woff2');
  execFileSync('pyftsubset', [fontPath, `--text-file=${textFile}`, '--flavor=woff2', `--output-file=${out}`], { stdio: 'pipe' });
  fontData = fs.readFileSync(out);
  console.log(`폰트 서브셋: ${chars.size}자, ${(fontData.length / 1024).toFixed(1)}KB`);
} catch (e) {
  fontData = fs.readFileSync(fontPath);
  console.log(`pyftsubset 없음 → 전체 폰트 포함 (${(fontData.length / 1024).toFixed(0)}KB)`);
}
css = css.replace("url('assets/fonts/Galmuri11.woff2')", `url(data:font/woff2;base64,${fontData.toString('base64')})`);

// 같은 전역(RS)을 쓰는 스크립트들이라 순서대로 이어 붙인다
const js = jsSources.map((s) => `// ── ${s.name} ──\n${s.code}`).join('\n');
const safeJs = js.replace(/<\/script/gi, '<\\/script');

const head = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="랜덤 스파이어">
<meta name="theme-color" content="#15111d">`;

const standalone = `<!doctype html>
<html lang="ko">
<head>
${head}
${title}
<style>
${css}
</style>
</head>
<body>
${body}
<script>
${safeJs}
</script>
</body>
</html>
`;

// 아티팩트는 게시할 때 doctype/head/body 로 감싸지므로 본문만 쓴다
const artifact = `${title}
<style>
${css}
</style>
${body}
<script>
${safeJs}
</script>
`;

fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs/index.html'), standalone);
fs.writeFileSync(path.join(ROOT, 'build/artifact.html'), artifact);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`docs/index.html ${(standalone.length / 1024).toFixed(0)}KB · build/artifact.html ${(artifact.length / 1024).toFixed(0)}KB`);
