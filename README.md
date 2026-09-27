# 랜덤 스파이어

랜덤 소환·합성 디펜스(메이플 랜덤 디펜스 스타일)에 슬레이 더 스파이어 1·2식 로그라이크 모험을 합친 모바일 웹 게임입니다. 아이폰 사파리 세로 화면에 맞춰 만들었고, 그래픽은 전부 도트입니다.

- **플레이**: `docs/index.html` 을 브라우저로 열기 (파일 하나, 설치·서버 불필요)
- **온라인 주소**: https://akaps1359.github.io/project/ (GitHub Pages, 이 브랜치에 푸시하면 자동 갱신)
- **기획서**: [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) — 규칙, 슬더스 1·2 대응표, 지휘관·차원 방랑자·룬·이벤트 표, 밸런스 시뮬레이션 결과

## 주요 내용

- 지휘관 7명 · 심연 10단계 · 연대기(해금)
- 막마다 10층 갈림길 맵, 1·2막은 두 지역 중 무작위, 2·3막 시작에 차원 방랑자
- 별점술사의 점괘, 성난 엘리트, 봉인석 3개로 여는 4막 균열의 핵
- 증강 54 · 유물 101 · 이벤트 45 · 룬 9 · 소모품 8 · 저주 12
- v2.1: 적대적 검증(확정 93건 + 2차 27건) 반영, 첫 전투 코치·연타 방지·환불 등 UI 개선, 강화까지 쓰는 봇 기준으로 재밸런스
- v2.2: 상황별 배경 음악(타이틀·지도·전투·보스·상점·휴식·이벤트·결과, 켜고 끄기 가능)·클래스별 공격 효과음, 전사 베기 이펙트, 지도에서 갈 수 있는 길 강조, 결과 화면 버튼 고정

## 온라인으로 올리기 (GitHub Pages, 설정 완료)

1. 저장소 Settings → General → Danger Zone → Change visibility → **Public**
   (GitHub 무료 요금제는 공개 저장소에서만 Pages 사용 가능. 비공개 유지는 GitHub Pro 이상)
2. Settings → Pages → Source: **Deploy from a branch** → Branch `claude/sweet-pasteur-006yat`, 폴더 **`/docs`** → Save
3. 1~2분 뒤 https://akaps1359.github.io/project/ 접속. 이 브랜치에 푸시할 때마다 자동 갱신

저장소를 공개하기 싫다면 Netlify · Cloudflare Pages · Vercel 에 `docs` 폴더를 올려도 됩니다.

## 개발

```bash
# 개발 중에는 game/ 폴더를 정적 서버로 띄워서 확인
npx http-server game -p 8765

# 밸런스 시뮬레이터 (봇이 모험 전체를 자동 플레이)
node tools/sim.js 280 smart --cmd=all          # 잘 하는 봇 (강화·길 계획·이벤트 미리 굴려 보기), 지휘관 7명 번갈아
node tools/sim.js 280 basic --cmd=all          # 강화를 거의 안 쓰는 예전 봇 (초보자 기준)
node tools/sim.js 280 random --cmd=all
node tools/sim.js 200 smart --asc=10           # 심연 10
node tools/sim.js 200 smart --keys             # 봉인석·4막을 노리는 봇
node tools/sim.js 200 smart --bp=banAugs='["corruption"]'   # 봇 조정값 (tools/simbot.js 의 SMART_DEFAULTS)
node tools/sim.js 300 smart --set 'hpGrowth=[0,1.11,1.0775,1.0654,1.0523]'   # 밸런스 상수 바꿔 보기

# 한 파일 빌드 → docs/index.html (+ build/artifact.html)
pip install fonttools brotli   # 폰트 서브셋용 (없으면 전체 폰트를 넣음)
node tools/build.js

# 기획서용 데이터 표
node tools/tables.js
```

밸런스 상수는 `game/src/data/units.js` 의 `RS.BAL`, 증강·소모품·저주는 `content.js`, 유물은 `relics.js`, 차원 방랑자는 `ancients.js`, 지휘관·심연·별점은 `meta.js`, 이벤트는 `events.js` 에 있습니다.

## 폰트

UI 글꼴은 [Galmuri](https://github.com/quiple/galmuri) (SIL Open Font License 1.1) 입니다. 라이선스 전문은 `game/assets/fonts/Galmuri-LICENSE.txt` 에 있습니다.
