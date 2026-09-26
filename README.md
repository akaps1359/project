# 랜덤 스파이어

랜덤 소환·합성 디펜스(메이플 랜덤 디펜스 스타일)에 슬레이 더 스파이어식 로그라이크 진행을 합친 모바일 웹 게임입니다. 아이폰 사파리 세로 화면에 맞춰 만들었고, 그래픽은 전부 도트입니다.

- **플레이**: `docs/index.html` 을 브라우저로 열기 (파일 하나, 설치·서버 불필요)
- **기획서**: [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) — 규칙, 유닛·적·증강·유물 표, 밸런스 시뮬레이션 결과

## 개발

```bash
# 개발 중에는 game/ 폴더를 정적 서버로 띄워서 확인
npx http-server game -p 8765

# 밸런스 시뮬레이터 (봇이 여러 판을 자동 플레이)
node tools/sim.js 300 smart
node tools/sim.js 300 random
node tools/sim.js 300 smart --set hpBase=70   # 밸런스 상수 바꿔 보기

# 한 파일 빌드 → docs/index.html (+ build/artifact.html)
pip install fonttools brotli   # 폰트 서브셋용 (없으면 전체 폰트를 넣음)
node tools/build.js

# 기획서용 데이터 표
node tools/tables.js
```

밸런스 상수는 `game/src/data/units.js` 의 `RS.BAL`, 증강·유물은 `game/src/data/content.js` 에 있습니다.

## 폰트

UI 글꼴은 [Galmuri](https://github.com/quiple/galmuri) (SIL Open Font License 1.1) 입니다. 라이선스 전문은 `game/assets/fonts/Galmuri-LICENSE.txt` 에 있습니다.
