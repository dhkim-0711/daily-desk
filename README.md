# AI반도체 데일리 인텔리전스

AI반도체 전략팀이 매일 국내외 NPU·AI반도체 동향, 관련 기사 출처, 시장 지표, 신규 예산·정책 아이템을 한 화면에서 확인할 수 있는 로컬 대시보드입니다.

## 실행

```powershell
npm start
```

브라우저에서 `http://localhost:4173`을 엽니다.

PowerShell 실행 정책 때문에 `npm`이 막히면 아래처럼 실행합니다.

```powershell
npm.cmd start
```

## HTML 파일로 바로 열기

서버 없이 HTML만 열고 싶으면 먼저 최신 데이터를 정적 스냅샷으로 저장합니다.

```powershell
npm.cmd run build:data
```

그다음 [public/index.html](./public/index.html)을 브라우저로 열면 됩니다. 이 방식은 실시간 새로고침이 아니라 마지막으로 생성한 `public/data-snapshot.js` 데이터를 보여줍니다.

## GitHub Pages로 열기

이 저장소를 GitHub에 올린 뒤 Pages 설정에서 배포 소스를 `main` 브랜치의 `/public` 폴더로 지정하면 정적 대시보드로 열 수 있습니다.

포함된 GitHub Actions 워크플로우 [build-pages-data.yml](./.github/workflows/build-pages-data.yml)은 매일 한국시간 오전 7시쯤 뉴스·시황 데이터를 갱신해 `public/data-snapshot.js`와 `public/data/dashboard.json`을 커밋하도록 구성되어 있습니다.

## 제공 기능

- Google News RSS 기반 국내외 AI반도체·NPU·AI 정책 기사 수집
- 리벨리온, 퓨리오사AI, 하이퍼엑셀, 딥엑스, 모빌린트 등 국내 기업 키워드 모니터링
- NVIDIA, Google, AMD, Broadcom, TSMC, Arm 등 해외 기업 동향 모니터링
- 기사별 원문 링크, 언론사 출처, 발행 시각, 관련도 점수 제공
- Nasdaq, SOX, KOSPI, KOSDAQ 및 주요 AI·반도체 종목 시황 제공
- 수집된 기술·기업 신호를 바탕으로 신규 예산·정책 아이템 추천

## 데이터 출처

- 뉴스: Google News RSS 검색 쿼리
- 시장: Yahoo Finance chart endpoint

## 조정 포인트

- 뉴스 쿼리: [server.js](./server.js)의 `newsQueries`
- 모니터링 기업: [server.js](./server.js)의 `watchCompanies`
- 주식·지수 목록: [server.js](./server.js)의 `equities`, `indices`
- 정책 추천 로직: [server.js](./server.js)의 `generatePolicyIdeas`

## 운영 메모

이 앱은 별도 API 키 없이 동작하도록 구성되어 있습니다. 기관망 또는 프록시 환경에서 외부 RSS·금융 API 접근이 막혀 있으면 `/api/dashboard` 호출이 일부 실패할 수 있습니다. 그 경우 같은 구조에 정부·기관 내부 뉴스 API, 유료 미디어 모니터링 API, 증권사 API를 연결하면 됩니다.
