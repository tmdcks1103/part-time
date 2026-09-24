"use client";

import { useState } from "react";
import type { AssistantProfile, DayKey } from "@part-time/scheduler-core";
import {
  dayLabels,
  monthLabel,
  parseBulkClasses,
  parseBulkUnavailable,
} from "@/lib/schedule-format";
import { UnavailableRuleRow } from "./UnavailableRuleRow";

export function AssistantEditor({
  assistant,
  month,
  disabled,
  onChange,
}: {
  assistant: AssistantProfile;
  month: string;
  disabled: boolean;
  onChange: (assistant: AssistantProfile) => void;
}) {
  const [tab, setTab] = useState<"dates" | "classes">(assistant.classes_revision === 0 ? "classes" : "dates");
  const [bulkText, setBulkText] = useState("");
  const [classText, setClassText] = useState("");
  const [notice, setNotice] = useState("");
  const rules = assistant.unavailable_rules
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => rule.date.startsWith(`${month}-`));
  const classes = Object.entries(assistant.classes).flatMap(([day, ranges]) =>
    (ranges ?? []).map((range, index) => ({
      day: day as DayKey,
      range,
      index,
    })),
  );
  const lastDay = new Date(
    Number(month.slice(0, 4)),
    Number(month.slice(5)),
    0,
  ).getDate();
  function update(change: (draft: AssistantProfile) => void) {
    const next = structuredClone(assistant);
    change(next);
    onChange(next);
  }
  function updateClass(change: (draft: AssistantProfile) => void) {
    update((draft) => {
      change(draft);
      draft.classes_revision = 0;
    });
  }
  const validClasses = classes.every(
    ({ range: [start, end] }) => start && end && start < end,
  );
  return (
    <section className="assistantEditor">
      <div className="editorHeading">
        <span className="avatar">
          {assistant.short_name.slice(0, 1) || "조"}
        </span>
        <div>
          <h2>{assistant.name || "새 조교"}</h2>
          <p>일정과 수업 시간 관리</p>
        </div>
      </div>
      <details className="profileSettings">
        <summary>이름 수정</summary>
        <div className="formGrid">
          <label>
            <span>이름</span>
            <input
              disabled={disabled}
              value={assistant.name}
              onChange={(e) =>
                update((a) => {
                  a.name = e.target.value;
                })
              }
            />
          </label>
          <label>
            <span>표시명</span>
            <input
              disabled={disabled}
              value={assistant.short_name}
              onChange={(e) =>
                update((a) => {
                  a.short_name = e.target.value;
                })
              }
            />
          </label>
        </div>
      </details>
      <div className="editorTabs" role="tablist" aria-label="조교 일정 유형">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "dates"}
          aria-controls="date-editor"
          onClick={() => {
            setTab("dates");
            setNotice("");
          }}
        >
          월별 근무 불가 <span>{rules.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "classes"}
          aria-controls="class-editor"
          onClick={() => {
            setTab("classes");
            setNotice("");
          }}
        >
          고정 수업 시간
        </button>
      </div>
      {tab === "dates" ? (
        <div id="date-editor" role="tabpanel" className="editorStack">
          <div className="sectionIntro">
            <strong>{monthLabel(month)}</strong>
            <p>이 달에만 적용됩니다. 다른 달의 일정은 그대로 보관됩니다.</p>
          </div>
          <div className="miniTitle">
            <h3>근무 불가 날짜</h3>
            <button
              disabled={disabled}
              onClick={() =>
                update((a) => {
                  a.unavailable_rules.push({
                    date: `${month}-01`,
                    mode: "all",
                  });
                })
              }
            >
              + 날짜 추가
            </button>
          </div>
          {rules.length ? (
            <div className="ruleRows">
              {rules.map(({ rule, index }) => (
                <UnavailableRuleRow
                  key={index}
                  rule={rule}
                  disabled={disabled}
                  minDate={`${month}-01`}
                  maxDate={`${month}-${lastDay}`}
                  onChange={(next) =>
                    update((a) => {
                      a.unavailable_rules[index] = next;
                    })
                  }
                  onDelete={() =>
                    update((a) => {
                      a.unavailable_rules.splice(index, 1);
                    })
                  }
                />
              ))}
            </div>
          ) : (
            <div className="emptyBox">
              <strong>등록된 불가 날짜가 없어요</strong>
              <p>휴가나 개인 일정을 이 달에 새로 입력하세요.</p>
            </div>
          )}
          <details className="bulkDetails">
            <summary>여러 날짜 한 번에 입력</summary>
            <div className="quickInput">
              <textarea
                aria-label="근무 불가 날짜 일괄 입력"
                disabled={disabled}
                value={bulkText}
                placeholder={"14-17 전체불가\n20 오픈 불가\n22 미들만 가능"}
                onChange={(e) => {
                  setBulkText(e.target.value);
                  setNotice("");
                }}
              />
              <button
                disabled={disabled || !bulkText.trim()}
                onClick={() => {
                  const parsed = parseBulkUnavailable(bulkText, month);
                  if (!parsed.length) {
                    setNotice(
                      "이 달의 날짜를 입력해 주세요. 예: 14-17 전체불가",
                    );
                    return;
                  }
                  update((a) => {
                    a.unavailable_rules = [
                      ...a.unavailable_rules,
                      ...parsed,
                    ].filter(
                      (r, i, all) =>
                        all.findIndex(
                          (other) =>
                            JSON.stringify(other) === JSON.stringify(r),
                        ) === i,
                    );
                  });
                  setBulkText("");
                  setNotice(`${parsed.length}개 일정을 반영했습니다.`);
                }}
              >
                이 달에 추가
              </button>
            </div>
          </details>
          {rules.length ? (
            <button
              className="textDanger"
              disabled={disabled}
              onClick={() => {
                if (
                  window.confirm(
                    `${monthLabel(month)} ${assistant.name}의 근무 불가 날짜를 모두 지울까요?`,
                  )
                )
                  update((a) => {
                    a.unavailable_rules = a.unavailable_rules.filter(
                      (r) => !r.date.startsWith(`${month}-`),
                    );
                  });
              }}
            >
              이번 달 불가 날짜 초기화
            </button>
          ) : null}
        </div>
      ) : (
        <div id="class-editor" role="tabpanel" className="editorStack">
          <div className="sectionIntro">
            <strong>매주 반복되는 수업</strong>
            <p>
              월을 바꿔도 유지됩니다. 시간표를 입력한 뒤 확인 완료를 눌러
              주세요.
            </p>
          </div>
          <div
            className={
              assistant.classes_revision === 1
                ? "reviewNotice confirmed"
                : "reviewNotice"
            }
          >
            {assistant.classes_revision === 1
              ? "✓ 수업 시간 확인 완료"
              : "수업 시간을 새로 입력해 주세요. 아직 배정에 반영되지 않습니다."}
          </div>
          <div className="miniTitle">
            <h3>요일별 수업</h3>
            <button
              disabled={disabled}
              onClick={() =>
                updateClass((a) => {
                  a.classes.mon ??= [];
                  a.classes.mon.push(["09:00", "10:00"]);
                })
              }
            >
              + 수업 추가
            </button>
          </div>
          {classes.map(({ day, range, index }) => (
            <div className="classRow" key={`${day}-${index}`}>
              <select
                aria-label="수업 요일"
                disabled={disabled}
                value={day}
                onChange={(e) =>
                  updateClass((a) => {
                    const [moved] = a.classes[day]!.splice(index, 1);
                    const next = e.target.value as DayKey;
                    a.classes[next] ??= [];
                    a.classes[next]!.push(moved);
                  })
                }
              >
                {Object.entries(dayLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                aria-label="수업 시작"
                type="time"
                disabled={disabled}
                value={range[0]}
                onChange={(e) =>
                  updateClass((a) => {
                    a.classes[day]![index][0] = e.target.value;
                  })
                }
              />
              <input
                aria-label="수업 종료"
                type="time"
                disabled={disabled}
                value={range[1]}
                onChange={(e) =>
                  updateClass((a) => {
                    a.classes[day]![index][1] = e.target.value;
                  })
                }
              />
              <button
                aria-label="수업 삭제"
                disabled={disabled}
                onClick={() =>
                  updateClass((a) => {
                    a.classes[day]!.splice(index, 1);
                  })
                }
              >
                ×
              </button>
            </div>
          ))}
          {!classes.length ? (
            <div className="emptyBox">
              수업이 없다면 아래에서 ‘수업 없음 확인’을 눌러 주세요.
            </div>
          ) : null}
          {!validClasses ? (
            <p className="parseNotice">
              종료 시간은 시작 시간보다 늦어야 합니다.
            </p>
          ) : null}
          <button
            className="primary"
            disabled={
              disabled || !validClasses || assistant.classes_revision === 1
            }
            onClick={() =>
              update((a) => {
                a.classes_revision = 1;
              })
            }
          >
            {classes.length ? "수업 시간 확인 완료" : "수업 없음 확인"}
          </button>
          <details className="bulkDetails">
            <summary>시간표 붙여넣기</summary>
            <div className="quickInput">
              <textarea
                aria-label="수업 시간 일괄 입력"
                disabled={disabled}
                value={classText}
                placeholder={"월 09:00-10:15, 11:00-11:50\n화 13:00-14:15"}
                onChange={(e) => {
                  setClassText(e.target.value);
                  setNotice("");
                }}
              />
              <button
                disabled={disabled || !classText.trim()}
                onClick={() => {
                  const parsed = parseBulkClasses(classText);
                  if (!Object.keys(parsed).length) {
                    setNotice(
                      "요일과 시간을 확인해 주세요. 예: 월 09:00-10:00",
                    );
                    return;
                  }
                  updateClass((a) => {
                    a.classes = parsed;
                  });
                  setClassText("");
                  setNotice(
                    "시간표를 교체했습니다. 내용을 확인한 뒤 확인 완료를 눌러 주세요.",
                  );
                }}
              >
                기존 수업 시간 교체
              </button>
            </div>
          </details>
          {classes.length ? (
            <button
              className="textDanger"
              disabled={disabled}
              onClick={() => {
                if (
                  window.confirm(
                    `${assistant.name}의 수업 시간을 초기화할까요?`,
                  )
                )
                  updateClass((a) => {
                    a.classes = {};
                  });
              }}
            >
              수업 시간 초기화
            </button>
          ) : null}
        </div>
      )}
      {notice ? (
        <p role="status" className="inputNotice">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
