// GPU 효과 층 (실험) — lab.html 에만 실린다. 본 게임(index.html)에는 이 파일도 PixiJS 도 없다.
// 전장 캔버스(Canvas 2D) 위에 WebGL 캔버스를 한 장 겹치고, 빛(glow)을 거기서 그린다.
//   · 겹친 캔버스는 불투명 검정 + CSS 'plus-lighter'(없으면 'screen') 합성이라 아래 장면에 빛을 "더하기"만 한다
//   · 캔버스 쪽은 빛 더하기('lighter') 그리기가 통째로 빠져 가벼워지고, 남는 여유로 빛·입자를 더 쓴다
//   · 바닥 빛 웅덩이(유닛보다 아래에 깔리는 것)는 순서가 중요해 캔버스에 그대로 둔다
// 실험 항목: 빛 번짐(bloom) · 주변 조명(큰 빛이 바닥·유닛을 물들임) · 입자 증가 · 도트 빛(낮은 해상도로 계산해 픽셀 그대로 확대)
(function (RS) {
  'use strict';

  const PX = globalThis.PIXI_LAB;
  const KEY = 'rs-lab-v1';
  const DEF = { on: true, dot: false, bloom: true, spill: true, more: true };

  const G = (RS.GpuFx = {
    ok: false, // WebGL 준비 끝
    failed: '',
    opt: Object.assign({}, DEF),
    stat: { fps: 0, ms: 0, n: 0 },
  });
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && typeof s === 'object') for (const k in DEF) if (typeof s[k] === 'boolean') G.opt[k] = s[k];
  } catch (e) {
    /* 저장소를 못 쓰는 환경 */
  }
  function saveOpt() {
    try {
      localStorage.setItem(KEY, JSON.stringify(G.opt));
    } catch (e) {
      /* 무시 */
    }
  }

  let R = null; // PIXI.WebGLRenderer
  let cv = null; // 겹친 캔버스
  let light = null; // 빛 스프라이트를 담는 층 (rt 로 그린다)
  let rt = null;
  let out = null;
  let sA = null;
  let sB = null;
  let blur = null;
  let glowTex = null;
  const pool = [];
  let used = 0;
  let W = 0;
  let H = 0;
  let K = 1; // 주 캔버스 기기 픽셀 → GL 픽셀
  let shown = false;
  const TINT = new Map();
  const IMG = new WeakMap();

  G.active = function () {
    return G.ok && G.opt.on;
  };

  function tint(col) {
    let v = TINT.get(col);
    if (v === undefined) {
      v = parseInt(col.slice(1), 16) || 0xffffff;
      TINT.set(col, v);
    }
    return v;
  }
  // 캔버스 쪽 bakeGlow 와 같은 모양(가운데 1 → 30% 지점 0.5 → 가장자리 0)의 흰 빛 한 장을 색만 바꿔 쓴다
  function makeGlowTex() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 63);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    return PX.Texture.from(c);
  }
  function imgTex(img) {
    let t = IMG.get(img);
    if (!t) {
      t = PX.Texture.from(img);
      t.source.scaleMode = 'nearest';
      IMG.set(img, t);
    }
    return t;
  }
  function spr() {
    let s = pool[used];
    if (!s) {
      s = new PX.Sprite(glowTex);
      s.blendMode = 'add';
      pool.push(s);
      light.addChild(s);
    }
    s.visible = true;
    used++;
    return s;
  }

  // 겹친 캔버스를 전장 캔버스에 맞춘다 (자리·CSS 크기·GL 해상도)
  G.sync = function () {
    const main = document.getElementById('cv');
    if (!cv || !main) return;
    const on = G.active();
    if (on !== shown) {
      cv.style.display = on ? 'block' : 'none';
      shown = on;
    }
    if (!on || !R) return;
    cv.style.left = main.offsetLeft + 'px';
    cv.style.top = main.offsetTop + 'px';
    cv.style.width = main.style.width;
    cv.style.height = main.style.height;
    cv.style.imageRendering = G.opt.dot ? 'pixelated' : 'auto';
    // 부드럽게: 기기 해상도의 절반 (빛은 흐릿해서 티가 안 난다) · 도트: 논리 해상도 2배(320×372)를 픽셀 그대로 확대
    const F = RS.FIELD;
    const w = G.opt.dot ? F.W * 2 : Math.max(F.W, Math.round(main.width * 0.5));
    const h = G.opt.dot ? F.H * 2 : Math.round((w * F.H) / F.W);
    K = w / main.width;
    if (w !== W || h !== H) {
      W = w;
      H = h;
      R.resize(w, h);
      if (rt) rt.destroy(true);
      rt = PX.RenderTexture.create({ width: w, height: h });
      sA.texture = rt;
      sB.texture = rt;
    }
    // 번짐 세기는 화면 너비에 비례 (해상도가 바뀌어도 같은 크기로 번지게)
    blur.strength = Math.max(2, (w / 160) * 5);
    blur.quality = G.opt.dot ? 2 : 3;
  };

  async function init() {
    const field = document.getElementById('field');
    if (!PX || !field) {
      G.failed = 'PixiJS 없음';
      return;
    }
    cv = document.createElement('canvas');
    cv.id = 'cvfx';
    cv.setAttribute('aria-hidden', 'true');
    const blend = window.CSS && CSS.supports && CSS.supports('mix-blend-mode', 'plus-lighter') ? 'plus-lighter' : 'screen';
    G.blend = blend;
    cv.style.cssText = `position:absolute;pointer-events:none;display:none;mix-blend-mode:${blend};`;
    field.appendChild(cv);
    try {
      R = new PX.WebGLRenderer();
      await R.init({
        canvas: cv, width: 160, height: 186, background: '#000000', backgroundAlpha: 1,
        antialias: false, resolution: 1, autoDensity: false, powerPreference: 'high-performance',
      });
    } catch (e) {
      G.failed = 'WebGL 시작 실패';
      R = null;
      cv.remove();
      cv = null;
      return;
    }
    glowTex = makeGlowTex();
    light = new PX.Container();
    out = new PX.Container();
    sA = new PX.Sprite();
    sB = new PX.Sprite();
    sB.blendMode = 'add';
    blur = new PX.BlurFilter({ strength: 8, quality: 3, resolution: 0.5 });
    sB.filters = [blur];
    out.addChild(sA, sB);
    G.ok = true;
    G.sync();
    if (G.onChange) G.onChange();
  }

  // 캔버스 렌더러의 빛 묶음(PixelCtx.batch[1])을 받아 스프라이트로 옮긴다. 좌표는 주 캔버스 기기 픽셀
  G.take = function (arr, n, S) {
    const o = G.opt;
    const spill = o.spill;
    const dotK = o.dot ? 1.15 : 1; // 도트 모드는 가장자리가 계단져 작아 보이므로 조금 키운다
    for (let k = 0; k < n; k++) {
      const it = arr[k];
      if (it.k === 1) {
        // 빛나는 그림(스프라이트 발광 마스크): 픽셀 그대로
        const s = spr();
        s.texture = imgTex(it.img);
        s.anchor.set(0, 0);
        s.tint = 0xffffff;
        s.alpha = it.a;
        const w = it.w * K;
        s.width = w;
        s.height = it.h * K;
        if (it.fl) {
          s.scale.x = -Math.abs(s.scale.x);
          s.x = it.x * K + w;
        } else s.x = it.x * K;
        s.y = it.y * K;
        it.img = null;
        continue;
      }
      const tc = tint(it.col);
      const r = it.r * K * dotK;
      const s = spr();
      s.texture = glowTex;
      s.anchor.set(0.5, 0.5);
      s.tint = tc;
      s.alpha = it.a;
      s.x = it.x * K;
      s.y = it.y * K;
      s.scale.set(r / 63, (r * (it.sq < 1 ? it.sq : 1)) / 63);
      // 주변 조명: 반지름 2.5(논리) 이상인 빛은 넓고 옅은 빛을 하나 더 깔아 바닥과 유닛을 물들인다
      if (spill && it.r >= 2.5 * S) {
        const q = spr();
        q.texture = glowTex;
        q.anchor.set(0.5, 0.5);
        q.tint = tc;
        q.alpha = it.a * 0.11;
        q.x = s.x;
        q.y = s.y;
        q.scale.set((r * 3) / 63, (r * 3 * (it.sq < 1 ? it.sq : 1)) / 63);
      }
    }
  };

  // 한 프레임을 마친다: 빛 층을 rt 로 그리고, rt + (번짐) rt 를 화면에
  G.present = function () {
    if (!G.active() || !R) return;
    for (let k = used; k < pool.length && pool[k].visible; k++) pool[k].visible = false;
    G.stat.n = used;
    R.render({ container: light, target: rt, clear: true });
    sB.visible = G.opt.bloom;
    sB.alpha = G.opt.dot ? 0.55 : 0.65;
    R.render(out);
    used = 0;
  };

  // ── 연결: 렌더러 draw 에 시간 재기, 화면 맞추기 뒤에 겹친 캔버스 맞추기 ──
  const P = RS.Renderer && RS.Renderer.prototype;
  if (P && PX) {
    const draw0 = P.draw;
    let last = 0;
    P.draw = function (b, dt) {
      const t0 = performance.now();
      draw0.call(this, b, dt);
      const t1 = performance.now();
      const st = G.stat;
      st.ms = st.ms ? st.ms * 0.92 + (t1 - t0) * 0.08 : t1 - t0;
      if (last) {
        const f = 1000 / Math.max(1, t1 - last);
        st.fps = st.fps ? st.fps * 0.92 + f * 0.08 : f;
      }
      last = t1;
    };
  }
  const UIo = RS.UI;
  if (UIo && UIo.fitCanvas) {
    const fit0 = UIo.fitCanvas;
    UIo.fitCanvas = function () {
      fit0.apply(this, arguments);
      G.sync();
    };
  }

  G.set = function (k, v) {
    G.opt[k] = v;
    saveOpt();
    if (UIo && UIo.fitCanvas) UIo.fitCanvas();
    else G.sync();
    if (G.onChange) G.onChange();
  };

  // ── 실험 패널: 전장 왼쪽 위 'LAB' 단추 → 켜고 끄기 + 성능 숫자 ──
  function panel() {
    const field = document.getElementById('field');
    if (!field) return;
    const st = document.createElement('style');
    st.textContent = `
#labpill{position:absolute;left:4px;top:4px;z-index:5;font:inherit;font-size:11px;line-height:1;padding:5px 7px;border:2px solid #f5c44a;background:rgba(21,17,29,.85);color:#f5c44a;border-radius:4px}
#labbox{position:absolute;left:4px;top:30px;z-index:5;width:min(220px,70%);padding:8px;background:rgba(21,17,29,.94);border:2px solid #f5c44a;border-radius:6px;color:#e8e2d6;font-size:12px}
#labbox[hidden]{display:none}
#labbox button{display:flex;justify-content:space-between;width:100%;margin:0 0 5px;padding:7px 8px;font:inherit;font-size:12px;color:#e8e2d6;background:#2a2238;border:2px solid #4a3d5e;border-radius:4px}
#labbox button.on{border-color:#f5c44a;color:#fff}
#labbox button.on b{color:#f5c44a}
#labbox button:disabled{opacity:.45}
#labbox .ls{margin-top:4px;color:#b8aec9;font-size:11px;line-height:1.5}
#labbox .lt{margin:0 0 6px;color:#f5c44a}`;
    document.head.appendChild(st);
    const pill = document.createElement('button');
    pill.id = 'labpill';
    pill.type = 'button';
    const box = document.createElement('div');
    box.id = 'labbox';
    box.hidden = true;
    field.appendChild(pill);
    field.appendChild(box);
    const rows = [
      ['on', 'GPU 효과'],
      ['bloom', '빛 번짐'],
      ['spill', '주변 조명'],
      ['more', '입자 늘리기'],
      ['dot', '도트 빛'],
    ];
    const btn = {};
    box.innerHTML = '<p class="lt">실험: GPU 효과 층</p>';
    for (const [k, label] of rows) {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<span>${label}</span><b></b>`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        G.set(k, !G.opt[k]);
      });
      box.appendChild(b);
      btn[k] = b;
    }
    const info = document.createElement('div');
    info.className = 'ls';
    box.appendChild(info);
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      box.hidden = !box.hidden;
    });
    G.onChange = function () {
      const act = G.active();
      pill.textContent = act ? 'LAB · GPU' : 'LAB · 기존';
      for (const [k] of rows) {
        const on = !!G.opt[k];
        btn[k].classList.toggle('on', on);
        btn[k].querySelector('b').textContent = on ? '켬' : '끔';
        if (k !== 'on') btn[k].disabled = !act;
      }
      btn.on.disabled = !G.ok; // 준비가 끝나면 다시 누를 수 있게
    };
    G.onChange();
    setInterval(() => {
      if (box.hidden) return;
      const s = G.stat;
      const mode = !G.ok ? (G.failed || 'GPU 준비 중…') : G.active() ? `GPU · 합성 ${G.blend} · ${W}×${H}` : '기존 캔버스 그리기';
      info.innerHTML = `${mode}<br>화면 ${s.fps.toFixed(0)}fps · 그리기 ${s.ms.toFixed(2)}ms<br>GPU 빛 ${G.active() ? s.n : 0}개`;
    }, 250);
  }

  function start() {
    panel();
    init();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})((globalThis.RS = globalThis.RS || {}));
