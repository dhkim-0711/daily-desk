# Daily Desk 브리핑 생성·발송 분리

## 운영 흐름

1. ChatGPT가 09:00 KST 기준 공개 원문 검증과 분석을 수행합니다.
2. 최종 원고를 `briefings/ready/YYYY-MM-DD.json`으로 원자적으로 저장합니다.
3. GitHub Actions가 같은 날 09:10 이후 원고를 검증하고 고정 HTML과 PDF를 생성합니다.
4. Gmail 발신함에서 같은 회차가 이미 발송됐는지 확인한 뒤 PDF만 첨부해 발송합니다.
5. 결과를 `briefings/state/YYYY-MM-DD.json`과 Actions 실행 요약에 기록합니다.

첫 발송 목표는 09:10 KST입니다. GitHub와 ChatGPT 예약 실행은 지연될 수 있어 정각 도착을 보장하지 않습니다. 원고 저장 이벤트와 09:10/09:20/09:35/09:50부터의 재확인 예약을 함께 사용합니다. 12:20부터 23:20까지는 매시간 재확인합니다. 원고가 늦어지면 준비 이후 발송합니다. 오늘 원고가 없을 때 어제 원고를 대신 보내지 않습니다.

ChatGPT 생성 작업도 09:00/10:00/11:00 KST에 실행을 시도합니다. 같은 날 완성본이나 발송 기록이 있으면 즉시 종료하여 기존 원고를 덮어쓰지 않습니다. 이 구성은 생성 작업의 지연 가능성을 없애지는 못합니다.

## 최초 1회 Gmail 연결

ChatGPT에 연결된 Gmail 인증은 GitHub Actions에 전달되지 않습니다. 아래 비밀 설정을 별도로 등록해야 실제 발송이 가능합니다.

1. 발신 Gmail 계정에서 2단계 인증과 앱 비밀번호 사용 가능 여부를 확인합니다.
2. [Google 앱 비밀번호](https://myaccount.google.com/apppasswords)에서 Daily Desk용 앱 비밀번호를 발급합니다.
3. [이 저장소 Actions secrets](https://github.com/dhkim-0711/daily-desk/settings/secrets/actions/new)에 이름 `DAILY_DESK_MAIL_CONFIG`로 아래 JSON을 등록합니다. 실제 값은 공개 저장소 파일이나 채팅에 넣지 않습니다.

```json
{"sender":"발신 Gmail 주소","recipient":"수신 메일 주소","app_password":"앱 비밀번호 16자리"}
```

4. [Send daily briefing](https://github.com/dhkim-0711/daily-desk/actions/workflows/send-daily-briefing.yml)에서 **Run workflow → mode: check-config**로 인증을 확인합니다. 메일은 보내지 않습니다.
5. 다음 생성본에서 **deliver** 실행 또는 예약 실행으로 발송을 확인합니다. 완료 판정은 Actions의 성공뿐 아니라 상태 기록의 `sent` 및 Gmail 발신함 확인 결과로 합니다.

앱 비밀번호를 사용할 수 없는 계정은 OAuth 방식의 별도 구성이 필요합니다. 일반 Google 계정 비밀번호를 사용하지 않습니다.

## 변경할 수 있는 부분

- 원고 작성: [EDITORIAL_GUIDELINES.md](EDITORIAL_GUIDELINES.md), [GENERATION_CONTRACT.md](GENERATION_CONTRACT.md)
- 디자인: [templates/briefing.html.j2](templates/briefing.html.j2), [assets/nipa-white.png](assets/nipa-white.png)
- 시간·입력·중복 검증: [deliver.py](deliver.py), [render.py](render.py)
- 발송 예약: [send-daily-briefing.yml](../.github/workflows/send-daily-briefing.yml)

템플릿은 2026-09-29 최종 발송 HTML의 표 구조·인라인 스타일에서 추출했습니다. 네이비 헤더, 핵심 요약, 기사 번호, 시사점 배경, 출처, NIPA 로고를 유지합니다. 메일 폰트는 수신 클라이언트의 폴백을 따릅니다. PDF는 Noto Sans CJK KR을 사용합니다.

## 실패와 중복 처리

- 원고 미완성/없음: `not_ready`, 메일을 보내지 않고 다음 실행에서 재확인합니다.
- 09:10 이전: `too_early`, 메일을 보내지 않습니다.
- 입력 검증 실패/인증 실패/PDF 실패: 오류로 종료합니다. 잘못된 본문은 보내지 않습니다.
- 이미 발송됨: Gmail 발신함 또는 영속 상태를 확인하고 종료합니다.
- SMTP 발송 도중 통신 단절: `uncertain`으로 기록하고 자동 재발송을 막습니다. 후속 실행은 Gmail 발신함을 재확인합니다. 메일 서버와 GitHub의 기록을 하나의 트랜잭션으로 묶을 수 없어 엄밀한 exactly-once는 보장하지 않습니다.
- `uncertain` 상태에서 발신함 확인 없이 상태 파일을 지우면 중복 발송할 수 있으므로 삭제하지 않습니다.

발송 이외 AI API 호출과 API 키는 없습니다. 공개 저장소 기준 Actions 사용 조건은 GitHub 계정 정책을 따릅니다.

## 로컬 점검

```bash
python -m pip install -r mail/requirements.txt
python -m unittest discover -s mail/tests -p 'test_*.py'
python mail/deliver.py --preflight
python mail/deliver.py --dry-run --date YYYY-MM-DD
```

dry-run은 렌더링만 수행하며 메일이나 원격 상태를 변경하지 않습니다. `mail/output/`은 커밋하지 않습니다.
