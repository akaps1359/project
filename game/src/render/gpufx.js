// GPU 빛 층 — 전장 캔버스(Canvas 2D) 위에 WebGL(PixiJS) 캔버스를 한 장 겹쳐 빛을 거기서 그린다.
//   층 순서: 전장(#cv, 바닥·유닛·적·입자) → 빛(#cvfx, 더하기 합성) → 위층(#cvtop, 피해 숫자·기술 예고·끌기)
//   · 빛 캔버스는 불투명 검정 + CSS 'plus-lighter'(없으면 'screen') 합성이라 아래 장면에 빛을 "더하기"만 한다
//   · 숫자·예고는 빛 위에 그려 빛에 씻기지 않는다 (장면의 빛이 글자를 비추지 않게)
//   · 바닥 빛 웅덩이(유닛 아래에 깔리는 것)는 순서가 중요해 전장 캔버스에 그대로 둔다
// 자연스럽게 보이게:
//   · 빛을 1/GAIN 로 줄여 쌓고 마지막에 되돌리며 부드럽게 눌러 준다(톤 매핑): 많이 겹쳐도 하얗게 타지 않고 색이 남는다.
//     아주 센 곳만 살짝 하얗게 번진다. 위쪽 한계 0.9 라 아래 장면이 완전히 덮이지 않는다
//   · 번짐(bloom)은 빛 층만 흐리게 한 사본 (장면 전체를 뿌옇게 하지 않는다)
//   · 주변 조명은 한 프레임에 가장 센 빛 몇 개만 (전부에 깔면 화면 전체가 한 색으로 물든다)
//   · 아주 옅은 디더링으로 넓고 옅은 빛의 계단(밴딩)을 없앤다
// WebGL 을 못 쓰거나 설정에서 끄면 예전처럼 전장 캔버스에 빛을 그린다 (renderer.js 의 flushGlows).
// 주소 끝에 ?lab 을 붙이면 왼쪽 위에 실험 패널(효과별 켜고 끄기·fps)이 뜬다.
(function (RS) {
  'use strict';

  const PX = globalThis.PIXI_LAB;
  const LAB = /[?&]lab\b/.test(location.search);
  const KEY = 'rs-lab-v1';
  // 기본값 (실험 패널에서만 바꿀 수 있다)
  const DEF = { on: true, dot: false, bloom: true, spill: true, more: true };
  const GAIN = 1.6; // 빛을 줄여 쌓는 비율 (8비트 텍스처에서 1을 넘는 빛도 눌러 줄 수 있게)
  const SPILL_N = 40; // 주변 조명을 까는 빛 개수 (센 순서)

  const G = (RS.GpuFx = {
    ok: false, // WebGL 준비 끝
    failed: '',
    lab: LAB,
    opt: Object.assign({}, DEF),
    stat: { fps: 0, ms: 0, n: 0, px: 0 },
  });
  if (LAB) {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && typeof s === 'object') for (const k in DEF) if (typeof s[k] === 'boolean') G.opt[k] = s[k];
    } catch (e) {
      /* 저장소를 못 쓰는 환경 */
    }
  }
  function saveOpt() {
    if (!LAB) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(G.opt));
    } catch (e) {
      /* 무시 */
    }
  }
  const userOff = () => !!(RS.settings && RS.settings.gpuOff);

  let R = null; // PIXI.WebGLRenderer
  let cv = null; // 빛 캔버스
  let top = null; // 위층 캔버스 (2D)
  let topRaw = null;
  let topDirty = false;
  let light = null; // 빛 스프라이트 층 (rt 로 그린다)
  let rt = null; // 빛 (1/GAIN)
  let rtB = null; // 번짐 (절반 해상도)
  let sBl = null; // rt → rtB (흐림 필터)
  let sOut = null; // rt + rtB → 화면 (톤 매핑 필터)
  let blur = null;
  let tone = null;
  let glowTex = null;
  // 둥근 빛은 ParticleContainer 하나로 (스프라이트 객체마다 변환을 다시 계산하지 않아 JS 가 훨씬 가볍다).
  // 빛나는 그림(스프라이트 발광 마스크)만 텍스처가 제각각이라 보통 스프라이트로
  let pc = null;
  const parts = [];
  const plist = [];
  let pu = 0;
  let imgLayer = null;
  const pool = [];
  let used = 0;
  let W = 0;
  let H = 0;
  let K = 1; // 전장 캔버스 기기 픽셀 → GL 픽셀
  let shown = false;
  const TINT = new Map();
  const IMG = new WeakMap();
  // 주변 조명 후보 (이번 프레임 빛: 세기·자리·색)
  const cand = [];
  let cn = 0;

  G.active = function () {
    return G.ok && G.opt.on && !userOff();
  };

  const VERT = `in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vUv;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
  vUv = aPosition;
}`;
  // 빛 + 번짐을 되돌려(×GAIN) 가장 센 채널 기준으로 부드럽게 누른다: 0.5 까지는 그대로, 그 위는 0.9 로 다가간다.
  // 눌린 만큼의 일부는 흰빛으로 (아주 센 빛의 가운데가 하얗게 타오르는 느낌). 마지막에 ±0.5/255 디더링
  const FRAG = `in vec2 vTextureCoord;
in vec2 vUv;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uBloom;
uniform float uBloomAmt;
uniform float uGain;
void main(void) {
  vec3 c = (texture(uTexture, vTextureCoord).rgb + uBloomAmt * texture(uBloom, vUv).rgb) * uGain;
  float m = max(c.r, max(c.g, c.b));
  const float K = 0.5;
  const float C = 0.9;
  if (m > K) {
    float f = K + (C - K) * (1.0 - exp(-(m - K) / (C - K)));
    c *= f / m;
    c = min(c + (m - f) * 0.12, vec3(C));
  }
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  finalColor = vec4(max(c + (n - 0.5) / 255.0, 0.0), 1.0);
}`;

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
      imgLayer.addChild(s);
    }
    s.visible = true;
    used++;
    return s;
  }
  // 둥근 빛 하나: 가운데 (x, y), 반지름 r·납작함 sq (GL 픽셀), 색 tc, 세기 a(이미 1/GAIN)
  function glowAt(x, y, r, sq, tc, a) {
    let q = parts[pu];
    if (!q) {
      q = new PX.Particle({ texture: glowTex, anchorX: 0.5, anchorY: 0.5 });
      parts.push(q);
    }
    plist[pu] = q;
    pu++;
    q.x = x;
    q.y = y;
    q.scaleX = r / 63;
    q.scaleY = (r * sq) / 63;
    q.tint = tc;
    q.alpha = a;
    return q;
  }

  // 빛·위층 캔버스를 전장 캔버스에 맞춘다 (자리·CSS 크기·해상도)
  G.sync = function () {
    const main = document.getElementById('cv');
    if (!cv || !main) return;
    const on = G.active();
    if (on !== shown) {
      cv.style.display = on ? 'block' : 'none';
      top.style.display = on ? 'block' : 'none';
      shown = on;
      if (!on) clearTop();
    }
    if (!on || !R) return;
    for (const c of [cv, top]) {
      c.style.left = main.offsetLeft + 'px';
      c.style.top = main.offsetTop + 'px';
      c.style.width = main.style.width;
      c.style.height = main.style.height;
    }
    if (top.width !== main.width || top.height !== main.height) {
      top.width = main.width;
      top.height = main.height;
      topRaw.imageSmoothingEnabled = false;
    }
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
      if (rtB) rtB.destroy(true);
      rt = PX.RenderTexture.create({ width: w, height: h });
      rtB = PX.RenderTexture.create({ width: Math.ceil(w / 2), height: Math.ceil(h / 2) });
      sBl.texture = rt;
      sBl.scale.set(0.5);
      sOut.texture = rt;
      tone.resources.uBloom = rtB.source;
    }
    // 번짐 반경은 화면 너비에 비례 (해상도가 바뀌어도 같은 크기로 번지게). rtB 가 절반 해상도라 반으로
    blur.strength = Math.max(1.5, (w / 160) * 2.4);
  };

  function clearTop() {
    if (topRaw && topDirty) {
      topRaw.setTransform(1, 0, 0, 1, 0, 0);
      topRaw.clearRect(0, 0, top.width, top.height);
      topDirty = false;
    }
  }
  // 렌더러가 숫자·예고를 그리기 전에 부른다: 위층을 비우고 그 2D 문맥을 돌려준다
  G.topRaw = function () {
    if (!G.active() || !topRaw) return null;
    clearTop();
    topDirty = true;
    return topRaw;
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
    top = document.createElement('canvas');
    top.id = 'cvtop';
    top.setAttribute('aria-hidden', 'true');
    top.style.cssText = 'position:absolute;pointer-events:none;display:none;image-rendering:pixelated;';
    topRaw = top.getContext('2d');
    try {
      R = new PX.WebGLRenderer();
      await R.init({
        canvas: cv, width: 160, height: 186, background: '#000000', backgroundAlpha: 1,
        antialias: false, resolution: 1, autoDensity: false, powerPreference: 'high-performance',
      });
      glowTex = makeGlowTex();
      light = new PX.Container();
      pc = new PX.ParticleContainer({ texture: glowTex, dynamicProperties: { vertex: true, position: true, rotation: false, uvs: false, color: true } });
      pc.blendMode = 'add';
      pc.particleChildren = plist;
      imgLayer = new PX.Container();
      light.addChild(pc, imgLayer);
      sBl = new PX.Sprite();
      blur = new PX.BlurFilter({ strength: 6, quality: 3 });
      sBl.filters = [blur];
      sOut = new PX.Sprite();
      tone = new PX.Filter({
        glProgram: PX.GlProgram.from({ vertex: VERT, fragment: FRAG, name: 'rs-tone' }),
        resources: {
          toneU: { uBloomAmt: { value: 0.6, type: 'f32' }, uGain: { value: GAIN, type: 'f32' } },
          uBloom: PX.Texture.WHITE.source,
        },
      });
      sOut.filters = [tone];
    } catch (e) {
      G.failed = 'WebGL 시작 실패';
      R = null;
      return;
    }
    // 그래픽 메모리를 잃으면(앱 전환 등) 캔버스 그리기로 돌아가고, 되찾으면(PixiJS 가 텍스처를 다시 올린다) 다시 켠다
    cv.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      G.ok = false;
      G.failed = 'GPU 문맥을 잃음';
      G.sync();
      if (G.onChange) G.onChange();
    });
    cv.addEventListener('webglcontextrestored', () => {
      G.ok = true;
      G.failed = '';
      W = H = 0; // 렌더 텍스처를 새로 만든다
      G.refresh();
    });
    field.appendChild(cv);
    field.appendChild(top);
    G.ok = true;
    if (RS.UI && RS.UI.fitCanvas) RS.UI.fitCanvas();
    else G.sync();
    if (G.onChange) G.onChange();
  }

  // 렌더러의 위층 빛 묶음(PixelCtx.batch[1])을 받아 스프라이트로 옮긴다. 좌표는 전장 캔버스 기기 픽셀
  G.take = function (arr, n, S) {
    const dotK = G.opt.dot ? 1.15 : 1; // 도트 모드는 가장자리가 계단져 작아 보이므로 조금 키운다
    const ig = 1 / GAIN;
    const spill = G.opt.spill;
    for (let k = 0; k < n; k++) {
      const it = arr[k];
      if (it.k === 1) {
        // 빛나는 그림(스프라이트 발광 마스크): 픽셀 그대로
        const s = spr();
        s.texture = imgTex(it.img);
        s.anchor.set(0, 0);
        s.tint = 0xffffff;
        s.alpha = it.a * ig;
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
      const sq = it.sq < 1 ? it.sq : 1;
      const x = it.x * K;
      const y = it.y * K;
      glowAt(x, y, r, sq, tc, it.a * ig);
      // 주변 조명 후보: 반지름 2.5(논리) 이상
      if (spill && it.r >= 2.5 * S) {
        let c = cand[cn];
        if (!c) cand.push((c = { w: 0, x: 0, y: 0, r: 0, sq: 1, tc: 0, a: 0 }));
        c.w = it.a * it.r;
        c.x = x;
        c.y = y;
        c.r = r;
        c.sq = sq;
        c.tc = tc;
        c.a = it.a;
        cn++;
      }
    }
  };

  const byW = (a, b) => b.w - a.w;
  // 한 프레임을 마친다: 주변 조명(센 빛 몇 개) → 빛 층을 rt 로 → 번짐 rtB → 톤 매핑해 화면에
  G.present = function () {
    if (!G.active() || !R) return;
    if (cn) {
      // 많으면 이번 프레임 후보만 잘라 센 순서로 (배열 뒤쪽의 지난 프레임 항목은 쓰지 않는다)
      const list = cn > SPILL_N ? cand.slice(0, cn).sort(byW) : cand;
      const m = Math.min(cn, SPILL_N);
      for (let k = 0; k < m; k++) {
        const c = list[k];
        glowAt(c.x, c.y, c.r * 3, c.sq, c.tc, (c.a * 0.13) / GAIN);
      }
      cn = 0;
    }
    for (let k = used; k < pool.length && pool[k].visible; k++) pool[k].visible = false;
    plist.length = pu;
    G.stat.n = used + pu;
    // 재기용(벤치): GPU 가 칠하는 픽셀 수 어림 (빛 스프라이트 넓이 + rt 지우기·번짐·톤 매핑 전체 화면 패스)
    if (G.measure) {
      let px = 0;
      for (let k = 0; k < used; k++) {
        const s = pool[k];
        px += Math.abs(s.scale.x * s.scale.y) * s.texture.width * s.texture.height;
      }
      for (let k = 0; k < pu; k++) px += parts[k].scaleX * parts[k].scaleY * 128 * 128;
      px += W * H * 2; // rt 지우기 + 톤 매핑
      if (G.opt.bloom) px += (W * H) / 4 * (1 + 2 * 3); // 절반 해상도 rtB + 흐림 가로·세로 × quality
      G.stat.px = px;
    }
    R.render({ container: light, target: rt, clear: true });
    const bl = G.opt.bloom;
    if (bl) R.render({ container: sBl, target: rtB, clear: true });
    tone.resources.toneU.uniforms.uBloomAmt = bl ? (G.opt.dot ? 0.5 : 0.6) : 0;
    R.render(sOut);
    used = 0;
    pu = 0;
  };

  // ── 연결: 화면 맞추기 뒤에 겹친 캔버스 맞추기 ──
  const UIo = RS.UI;
  if (UIo && UIo.fitCanvas) {
    const fit0 = UIo.fitCanvas;
    UIo.fitCanvas = function () {
      fit0.apply(this, arguments);
      G.sync();
    };
  }
  // 설정에서 켜고 끌 때
  G.refresh = function () {
    if (UIo && UIo.fitCanvas) UIo.fitCanvas();
    else G.sync();
    if (G.onChange) G.onChange();
  };
  G.set = function (k, v) {
    G.opt[k] = v;
    saveOpt();
    G.refresh();
  };

  // ── 실험 패널 (?lab): 전장 왼쪽 위 'LAB' 단추 → 효과별 켜고 끄기 + 성능 숫자 ──
  function panel() {
    const field = document.getElementById('field');
    if (!field) return;
    // 그리기 시간·fps 재기
    const P = RS.Renderer && RS.Renderer.prototype;
    if (P) {
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
      ['on', 'GPU 빛'],
      ['bloom', '빛 번짐'],
      ['spill', '주변 조명'],
      ['more', '입자 늘리기'],
      ['dot', '도트 빛'],
    ];
    const btn = {};
    box.innerHTML = '<p class="lt">실험: GPU 빛 층</p>';
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
    const prev = G.onChange;
    G.onChange = function () {
      if (prev) prev();
      const act = G.active();
      pill.textContent = act ? 'LAB · GPU' : 'LAB · 캔버스';
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
      const mode = !G.ok ? (G.failed || 'GPU 준비 중…') : userOff() ? '설정에서 꺼 둠' : G.active() ? `GPU · 합성 ${G.blend} · ${W}×${H}` : '캔버스 그리기';
      info.innerHTML = `${mode}<br>화면 ${s.fps.toFixed(0)}fps · 그리기 ${s.ms.toFixed(2)}ms<br>GPU 빛 ${G.active() ? s.n : 0}개`;
    }, 250);
  }

  function start() {
    if (LAB) panel();
    init();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})((globalThis.RS = globalThis.RS || {}));
