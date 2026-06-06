# 제2생활관 조교 근무표 생성기

2026년 6월 조교 수업시간표와 근무 불가 날짜를 바탕으로 근무표를 생성하는 작은 CLI 프로그램입니다. 외부 패키지 없이 macOS 기본 `python3`로 실행됩니다.

## 실행

제품형 웹 앱은 아래처럼 실행합니다.

```bash
cd /Users/ksc/Desktop/lab/part-time
npm install
npm run dev
```

기본 주소는 `http://localhost:3000`입니다.

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

## 현재 6월표 상태

현재 데이터 기준으로 `2026-06-15 월요일 미들(13:00-18:00)`은 가능한 조교가 없습니다. 프로그램은 이 칸을 `미배정`으로 남기고 검증 리포트에 표시합니다.

그 외 111개 근무는 배정되었고, 조교별 인정 시간은 38~40시간 범위입니다.
