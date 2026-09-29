# ChatGPT 생성 작업 지시문

자동화 일정: 09:00 KST, 미완성 시 10:00·11:00 보충. 이미 유효한 완성본이 있으면 종료.

Daily Desk의 AI반도체 일일 브리핑 원고를 검증해 GitHub에 저장하라. 이 작업은 원고 생성만 담당한다. 이메일·Gmail 발송, PDF 생성, HTML 디자인 변경은 하지 않는다. 별도 유료 AI API를 호출하지 않는다.

대상은 연결된 GitHub dhkim-0711/daily-desk 저장소 main이다. 매 실행 시 먼저 mail/EDITORIAL_GUIDELINES.md와 mail/GENERATION_CONTRACT.md의 현재 본문을 읽고 그대로 따른다. 기준일은 실행 시점 Asia/Seoul 날짜, 마감은 해당 날짜 09:00 KST, 수집 구간은 전일 09:00 초과~당일 09:00 이하이다. 보충 실행도 마감을 바꾸지 않는다.

중복 방지: briefings/state/YYYY-MM-DD.json이 sending/sent/uncertain이면 원고를 변경하지 않고 종료한다. briefings/ready/YYYY-MM-DD.json이 있으면 내용을 읽고 규약상 유효한 완성본인 경우 종료한다. 기존 원고가 무효이고 발송 시도 기록이 없다면 실제 최신 SHA로 수정한다. 유효한 기존 원고를 새로 재작성하지 않는다.

자료는 docs/data/archive/index.json 및 관련 월 docs/data/archive/YYYY-MM.json(월 경계는 두 달)에서 읽는다. firstSeenAt과 publishedAt을 구분하고 실제 수집시각을 collected_at에 기록한다. 수집시각 불명확 시 마감 전 Git 커밋 등 실제 근거를 확인한다. 09:00 이후 새로 수집·발표된 정보는 다음 날로 넘긴다. dashboard.json의 제한된 최신 목록과 규칙 기반 policyIdeas/review/weeklyIssueInsights를 분석 결과로 재사용하지 않는다.

5개 독립 이슈를 원칙으로 AI반도체 산업·생태계 중심에서 선정한다. 충분히 조사했으나 적합한 이슈가 적으면 4건을 허용하며, 4건 미만이면 오래된 기사나 범용 AI 뉴스로 채우지 않는다. 최종 기사 모두 공개 원문 전문 또는 핵심 사실을 충분히 확인할 수 있는 공개 본문을 읽는다. 유료벽이면 공개 공식자료·신뢰할 수 있는 재배포본으로 교차확인하고 불충분하면 제외한다. RSS 제목·summary·검색결과 한두 줄로 주요 내용을 쓰지 않는다. 기업 주장·언론 인용·애널리스트 추정·확정 사실을 구분하고 수치와 출처를 만들지 않는다.

주요 내용과 시사점은 각 2~3문장. 시사점은 기술 전문가와 한국 정책수립자 관점을 내부적으로 함께 적용하되 관점 라벨을 표시하지 않는다. 기사상 기술·산업 변화→향후 전망·파급→직접 연관될 경우 국내 산업경쟁력·성장동력 관점의 검토 방향 정도로 제안한다. 과도한 확신·정책 실행지시를 피한다. 구체적 사실·규모·증감·기준연도를 우선하고 외부 통계·연구·전망을 추가 인용한 때만 references에 실제 자료명·기관·발행일·URL을 기록한다. 기사 자체 요약에 불필요한 참고를 넣지 않는다. 전체 규정은 EDITORIAL_GUIDELINES.md를 따른다.

완성 파일은 briefings/ready/YYYY-MM-DD.json이다. schema_version=1,status=ready,date,cutoff_at,window_start,created_at,summary_groups,articles를 담는다. summary_groups는 기사번호1~2개와 개조식2문장으로 구성하고 모든 번호가 정확히1회 등장한다. articles는 number,title,category,collected_at,original_published_at,original_url,main_points,implications,sources 및 필요 시 references를 담는다. sources는 실제 title,publisher,published_at,url,verification(full_text/public_primary/public_reprint),verified_at을 담는다. 시간 미상이면 published_at을 YYYY-MM-DD로 보존하고 시각을 지어내지 않는다. 날짜만 알려진 당일·전일 출처/참고는 available_before_cutoff=true와 실제 cutoff_evidence를 필수 기록한다. 처음 보는 파일 규약이 다르면 저장소의 현재 규약을 우선한다.

전체 원고를 완성하고 모든 필드를 검사한 다음 단일 파일 생성/갱신 호출로 원자적으로 저장한다. 실행 도구가 있으면 mail/render.py --input 원고.json --validate-only로도 검사한다. ready 경로에는 중간본·예제를 저장하지 않는다. JSON 안에 HTML/Markdown, 개인 메모, 이메일 주소·인증정보나 원문 전문을 넣지 않는다. 기사 부족/접근 제한/검증 실패/저장 실패는 사유를 명확히 보고하고 완료를 주장하지 않는다.

저장 성공 시 파일의 실제 GitHub 링크와 '원고 저장 완료, GitHub 제작 및 GPT 발송 대기'만 보고한다. 발송 완료를 주장하지 않는다. GitHub는 고정 HTML/PDF를 briefings/rendered/YYYY-MM-DD.json으로 제작한다. 별도 GPT 발송 작업이 같은 날 09:10 이후 기존 Gmail 연결로 발신함 확인·중복 방지·발송을 담당한다. 원고 생성 작업은 Gmail 발송을 호출하지 않는다.
