# 제2생활관 조교 근무표 생성기

조교의 수업 시간과 월별 근무 불가 날짜를 바탕으로 근무표를 생성하는 Next.js 웹 앱입니다. 기존 Python CLI와 정적 프로토타입도 보관되어 있습니다.

## 실행

Node.js 24 이상에서 웹 앱을 실행합니다.

```bash
cd /Users/ksc/Desktop/lab/part-time
npm install
npm run dev
```

기본 주소는 `http://localhost:3000`입니다.

공유 저장에는 `apps/web/.env.local`의 `POSTGRES_URL`이 필요합니다. 기존 Supabase 프로젝트와 연결하며, 환경 파일은 커밋하지 않습니다. DB 스키마는 `apps/web/db/schema.sql`에 있습니다. DB가 연결되지 않으면 편집은 브라우저에 보관되며 화면에 서버 저장 실패가 표시됩니다.

기존 정적 프로토타입은 아래 파일을 브라우저로 열면 됩니다.

```text
/Users/ksc/Desktop/lab/part-time/app/index.html
```

기존 CLI 생성기는 아래처럼 실행합니다.

```bash
cd /Users/ksc/Desktop/lab/part-time
python3 scheduler.py
```

CLI 결과 파일은 `output/`에 생성됩니다.

- `2026_06_schedule.md`: 바로 읽기 좋은 표
- `2026_06_schedule.csv`: 엑셀/스프레드시트용
- `2026_06_schedule.html`: 브라우저로 확인하는 표
- `2026_06_summary.json`: 근무 시간 및 검증 요약

## 웹 앱에서 가능한 작업

- 월, 시간 편차, 생성 시드, 시도 횟수 조정
- 평일/주말 근무 시간대 및 인정 시간 수정
- 조교 추가/삭제, 이름과 표시명 수정
- 조교별 수업 시간과 근무 불가 조건 입력
- 월간 근무표 자동 생성
- 근무 칸 선택 후 가능한 조교로 수동 재배정
- CSV 또는 JSON으로 내보내기

웹 앱의 중복 배정 규칙: 평일에는 조교별로 오픈·미들·마감 중 한 번만 배정하며, 야간을 추가로 배정할 수 있습니다. 주말에는 같은 조교에게 오픈·미들·마감을 모두 배정할 수 있습니다. 자동 배정과 수동 배정에 같은 규칙을 적용하며, 수업 시간과 개인 근무 불가 조건은 계속 적용됩니다.

수업 시간은 매주 반복되며 월을 바꿔도 유지됩니다. 기존 수업 시간표는 새 버전에서 한 번 초기화된 상태로 표시됩니다. 각 조교의 수업 시간을 입력한 뒤 **수업 시간 확인 완료**를 눌러 주세요. 수업이 없다면 **수업 없음 확인**을 누릅니다. 미확인 조교가 있으면 자동 배정을 기다립니다.

개인 근무 불가는 실제 날짜(`YYYY-MM-DD`)로 보관됩니다. 6월에 입력한 날짜는 7월로 복사되지 않으며, 6월로 돌아오면 그대로 표시됩니다. 월별 배정 설정과 수동 배정도 각각 보관됩니다.

명단과 배정 설정은 먼저 이 기기에 저장한 뒤 서버에 동기화합니다. 다른 사용자가 먼저 저장하면 충돌 안내를 표시하고 현재 편집을 유지합니다. **서버 내용 확인**은 서버 저장본을 불러오는 작업입니다. 명시적으로 저장한 근무표 버전은 **저장한 버전**에서 다시 불러올 수 있습니다.

## 검증

```bash
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run start -w apps/web -- --port 3001
```

서버가 실행된 상태에서 다른 터미널에서 `npm run test:e2e`를 실행합니다. 다른 포트는 `TEST_URL=http://localhost:3000 npm run test:e2e`로 지정합니다. 브라우저 테스트는 API 응답을 격리된 데이터로 대체하므로 실제 DB에 쓰지 않습니다. 테스트 스크린샷은 `/tmp/part-time-verification/`에 생성됩니다.

오류 원인, 수정 내용, 성능 측정과 DB 검증 한계는 [개선 기록](docs/2026-09-scheduler-fixes.md)에 정리했습니다.

## 데이터 수정

입력 데이터는 `data/june_2026.json`에 있습니다.

- `assistants[].classes`: 요일별 수업 시간
- `assistants[].unavailable_rules`: 날짜별 근무 불가 조건
- `rules.shift_templates`: 평일/주말 근무 시간대와 인정 시간
- `rules.fairness_tolerance_hours`: 조교별 월간 시간 차이 허용치

근무 불가 규칙은 세 가지 방식으로 적습니다.

```json
{ "date": "2026-06-16", "mode": "all" }
{ "date": "2026-06-16", "unavailable_shifts": ["open"] }
{ "date": "2026-06-16", "only_shifts": ["middle"] }
```

## 기존 CLI의 6월 예제

기존 예제 데이터 기준으로 `2026-06-15 월요일 미들(13:00-18:00)`은 가능한 조교가 없습니다. 프로그램은 이 칸을 `미배정`으로 남기고 검증 리포트에 표시합니다. 이 수치는 수업 시간 재입력 전 웹 앱의 현재 결과를 뜻하지 않습니다.

그 외 111개 근무는 배정되었고, 조교별 인정 시간은 38~40시간 범위입니다.
