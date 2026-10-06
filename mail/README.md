# Daily Desk: 원고 작성 · 제작 · GPT 발송

## 운영 흐름

1. ChatGPT 원고 생성 작업이 09:30 KST 기준 공개 원문을 검증·분석합니다. 10:30·11:30에는 미완성 회차만 보충합니다.
2. 완성 원고를 `briefings/ready/YYYY-MM-DD.json`으로 저장합니다.
3. GitHub Actions가 고정 디자인의 HTML·PDF와 인라인 NIPA 로고를 만들고 `briefings/rendered/YYYY-MM-DD.json`에 한 번에 게시합니다. 기사/디자인을 새로 작성하지 않습니다.
4. 별도 GPT 발송 작업이 **기존 Gmail 연결**로 발송합니다. 첫 시도는 09:50, 당일 23:50까지 매시간 미발송 여부를 재확인합니다.
5. 발신함의 SENT·HTML·PDF 증거와 함께 `briefings/state/YYYY-MM-DD.json`에 기록합니다.
6. GitHub가 11:05부터 매시간 발송 기록을 독립적으로 감시하고, 미확인일 때 단계별 오류를 Actions에 표시합니다.

**Gmail 앱 비밀번호나 별도 Google OAuth 설정이 필요하지 않습니다.** 기존 `DAILY_DESK_MAIL_CONFIG` secret은 이 운영 경로에서 읽거나 사용하지 않습니다. GitHub는 Gmail에 접근하지 않습니다. 별도 유료 AI API도 사용하지 않습니다.

## 기사 선정과 편중 방지

2026-09-30 원고부터 **기본 6건·최대 7건**으로 운영합니다. 7번째 이슈는 별개의 중요한 변화가 있을 때만 추가하며, 적합한 이슈가 부족하면 사유와 함께 4~5건을 허용합니다. 모든 기사의 원문 검증 수준과 주요 내용·시사점 각 2~3문장을 유지합니다.

국내 NPU, 국내 정책·사업화·수요처, 글로벌 가속기, 운영 SW, 메모리·패키징·인프라를 각각 점검하고 산업적 중요도로 비교합니다. 국내외 할당량 없이 동일 기업 반복 선정의 근거를 재검토합니다. 원고의 selection_audit는 선정·제외 이유와 점검 결과를 보관하며 이메일/PDF에는 표시하지 않습니다. 수집 정렬의 기업 가점은 정규화한 고유 기업 수로 계산해 별칭 중복을 제거합니다. 수집 점수를 최종 선정 순위로 사용하지 않습니다.

## 지연·누락 대응

| 단계 | 기본 실행 | 보충/검사 |
|---|---|---|
| 원고 GPT | 09:30 | 10:30, 11:30 (유효 원고가 있으면 종료) |
| GitHub 제작 | 원고 저장 시 | 09:35~23:35 매시간 |
| Gmail 발송 GPT | 09:50 | 10:50~23:50 매시간 (미발송만) |
| 독립 감시 | 11:05 | 12:05~23:05 매시간 |

모두 Asia/Seoul 기준입니다. ChatGPT와 GitHub의 예약은 지연될 수 있으며 정각 도착이나 무누락을 보장하지 않습니다. 원고 완성 시각에 따라 첫 회차가 아닌 보충 회차에 발송될 수 있습니다. GitHub Actions 실패 알림 수신은 계정 알림 설정에 따릅니다.

발송을 못 했다는 이유로 전날 브리핑을 당일 것으로 보내거나 09:30 이후 정보를 섞지 않습니다. 원고 부족·검증 실패는 완료로 위장하지 않습니다.

## 파일과 책임

- [EDITORIAL_GUIDELINES.md](EDITORIAL_GUIDELINES.md): 확정 작성 기준
- [GENERATION_CONTRACT.md](GENERATION_CONTRACT.md), [GENERATION_PROMPT.md](GENERATION_PROMPT.md): 원고 생성 전용
- [prepare.py](prepare.py): GitHub 제작·MIME 번들 게시 (Gmail 인증 불필요)
- [render.py](render.py), [templates/briefing.html.j2](templates/briefing.html.j2): 확정 HTML/PDF 디자인
- [DELIVERY_CONTRACT.md](DELIVERY_CONTRACT.md), [send_with_connectors.js](send_with_connectors.js): GPT 연결 도구 기반 발송·중복 방지
- [check_delivery.py](check_delivery.py): 발송 상태 독립 감시
- [send-daily-briefing.yml](../.github/workflows/send-daily-briefing.yml): 이름은 호환을 위해 유지하되 실제 역할은 제작·감시

`deliver.py`는 이전 SMTP 구현의 보관 코드이며 현재 워크플로/예약은 호출하지 않습니다. 발송기 변경 시 기존 sending/sent/uncertain 상태를 임의로 삭제하지 않습니다.

## 검증과 한계

날짜·09:30 마감·원고/본문/PDF 해시·발신 계정·정확한 수신자와 제목을 검사합니다. 발송 전 SHA 조건부 쓰기로 선점하며 경쟁 실행, 이전 날짜, 변조/부분 번들, 추가 첨부를 차단합니다. 발송 후 실제 Gmail 메일을 다시 읽어 확인합니다.

응답 유실 시 발신함부터 대조합니다. 결과가 불명확하면 `uncertain` 상태로 남기고 자동 재전송을 막습니다. 이 설계는 중복 위험을 낮추지만 발송 직전 중단이 확인 필요 상태로 남을 수 있습니다. GitHub와 Gmail 사이에 공통 트랜잭션은 없습니다.

## 로컬 검증

```bash
python -m pip install -r mail/requirements.txt
python -m unittest discover -s mail/tests -p 'test_*.py'
node --test mail/tests/test_sender.cjs
npm test
python mail/prepare.py --preflight
```

`mail/output/`과 임시 검증 파일은 커밋하지 않습니다. 수신 주소와 인증정보를 공개 파일에 추가하지 않습니다. PDF의 Noto Sans CJK KR, 원래 메일의 네이비 헤더·요약·기사 배지·시사점 배경·NIPA 로고를 유지합니다.


[운영 시간 변경: 2026-10-07부터]
한국시간 09:20에 기존 정기 수집과 별도로 추가 수집을 예약합니다. 원고는 09:30 마감, 전일 09:30 초과~당일 09:30 이하를 주 분석 구간으로 하며 미완성 회차만 10:30·11:30에 보충합니다. 첫 Gmail 발송 목표는 09:50, 보충은 10:50~23:50 매시간입니다. GitHub 제작은 원고 저장 즉시 및 09:35~23:35 매시간, 독립 발송 감시는 11:05~23:05 매시간입니다. 09:20 추가 수집의 실제 실행시각·마감 전 완료 여부는 collection 기록으로 확인합니다. 지연돼 마감 후 수집된 자료를 소급하지 않으며 추가 수집 미확인을 후보 없음으로 처리하지 않습니다. 예약과 RSS 반영은 지연될 수 있고 검증·제작이 끝나지 않으면 발송 목표를 위해 검사를 생략하지 않습니다. 2026-10-06까지의 과거 원고·번들은 기존 09:00 마감으로 계속 검증하며 이미 발송한 회차는 수정·재발송하지 않습니다.
