// 실험 페이지(lab.html)에 싣는 PixiJS 묶음. 쓰는 것만 골라 크기를 줄인다 (전체 828KB → 약 390KB).
// 다시 만들기:
//   npm i pixi.js@8.21.0 esbuild
//   npx esbuild tools/pixi_lab_entry.mjs --bundle --minify --format=iife --outfile=game/vendor/pixi-lab.min.js
import { WebGLRenderer, Container, Sprite, Texture, RenderTexture, BlurFilter } from 'pixi.js';

globalThis.PIXI_LAB = { WebGLRenderer, Container, Sprite, Texture, RenderTexture, BlurFilter };
