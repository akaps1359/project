// 게임에 싣는 PixiJS 묶음 (GPU 빛 층, src/render/gpufx.js). 쓰는 것만 골라 크기를 줄인다 (전체 828KB → 약 400KB).
// unsafe-eval: 셰이더 연결 코드를 new Function 없이 만든다 (아티팩트처럼 eval 을 막는 페이지에서도 돌게)
// 다시 만들기:
//   npm i pixi.js@8.21.0 esbuild
//   npx esbuild tools/pixi_entry.mjs --bundle --minify --format=iife --outfile=game/vendor/pixi.min.js
import 'pixi.js/unsafe-eval';
import { WebGLRenderer, Container, Sprite, Texture, RenderTexture, BlurFilter, Filter, GlProgram, ParticleContainer, Particle } from 'pixi.js';

globalThis.PIXI_LAB = { WebGLRenderer, Container, Sprite, Texture, RenderTexture, BlurFilter, Filter, GlProgram, ParticleContainer, Particle };
