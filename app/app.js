const UNASSIGNED = "__unassigned__";
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_NAMES = ["월", "화", "수", "목", "금", "토", "일"];
const SHIFT_LABELS = { open: "오픈", middle: "미들", close: "마감", night: "야간" };

const defaultConfig = {
  month: "2026-06",
  title: "제2생활관 조교 2026년 6월 근무표",
  rules: {
    fairness_tolerance_hours: 10,
    max_shifts_per_day: 1,
    shift_templates: {
      weekday: [
        { key: "open", name: "오픈", start: "09:00", end: "15:00", credit_hours: 5 },
        { key: "middle", name: "미들", start: "13:00", end: "18:00", credit_hours: 5 },
        { key: "close", name: "마감", start: "16:00", end: "22:00", credit_hours: 5 },
        { key: "night", name: "야간", start: "22:00", end: "24:00", credit_hours: 2 }
      ],
      weekend: [
        { key: "open", name: "오픈", start: "09:00", end: "15:00", credit_hours: 5 },
        { key: "middle", name: "미들", start: "15:00", end: "20:00", credit_hours: 4 },
        { key: "close", name: "마감", start: "20:00", end: "24:00", credit_hours: 4 }
      ]
    }
  },
  assistants: [
    { id: "seonghun", name: "김성훈", short_name: "성훈", classes: { mon: [["09:00", "10:50"], ["11:00", "13:50"]], tue: [["09:00", "09:50"], ["12:00", "12:50"]], wed: [["09:00", "10:50"], ["13:00", "14:50"]], thu: [["12:00", "12:50"], ["13:00", "15:50"], ["16:00", "17:50"]], fri: [["11:00", "12:50"]] }, unavailable_rules: [{ date: "2026-06-14", mode: "all" }, { date: "2026-06-15", mode: "all" }, { date: "2026-06-16", mode: "all" }, { date: "2026-06-17", mode: "all" }] },
    { id: "jeongeun", name: "김정은", short_name: "정은", classes: { mon: [["09:00", "11:50"], ["13:00", "13:50"], ["15:00", "15:50"]], tue: [["11:00", "12:50"], ["16:00", "16:50"]], wed: [["09:00", "12:50"], ["13:00", "14:50"]], thu: [["09:00", "12:50"], ["15:00", "16:50"]] }, unavailable_rules: [{ date: "2026-06-16", unavailable_shifts: ["open"] }] },
    { id: "chaeyeon", name: "오채연", short_name: "채연", classes: { mon: [["11:00", "11:50"], ["12:00", "13:50"]], tue: [["10:00", "11:50"], ["12:00", "12:50"], ["15:00", "17:50"]], wed: [["09:00", "11:50"], ["12:00", "14:50"]] }, unavailable_rules: [{ date: "2026-06-16", mode: "all" }, { date: "2026-06-17", mode: "all" }] },
    { id: "seungchan", name: "김승찬", short_name: "승찬", classes: { mon: [["13:00", "14:50"], ["15:00", "17:50"]], tue: [["10:00", "10:50"]], wed: [["10:00", "11:50"]] }, unavailable_rules: [{ date: "2026-06-14", mode: "all" }, { date: "2026-06-15", mode: "all" }, { date: "2026-06-16", mode: "all" }] },
    { id: "jihyun", name: "김지현", short_name: "지현", classes: { mon: [["15:00", "15:50"]], tue: [["12:00", "13:50"], ["14:00", "17:50"]], wed: [["15:00", "16:50"]], thu: [["12:00", "14:50"], ["15:00", "16:50"]], fri: [["09:00", "11:50"], ["12:00", "13:50"]] }, unavailable_rules: [{ date: "2026-06-13", mode: "all" }, { date: "2026-06-14", mode: "all" }, { date: "2026-06-18", mode: "all" }] },
    { id: "seoyeon", name: "고서연", short_name: "서연", classes: { mon: [["10:00", "12:50"]], wed: [["10:00", "12:50"]], fri: [["10:00", "12:50"], ["16:00", "18:50"]] }, unavailable_rules: [{ date: "2026-06-13", mode: "all" }, { date: "2026-06-14", mode: "all" }, { date: "2026-06-15", mode: "all" }] },
    { id: "sunwoo", name: "진선우", short_name: "선우", classes: { mon: [["11:00", "12:50"], ["13:00", "16:50"]], tue: [["09:00", "10:50"], ["11:00", "11:50"], ["17:00", "17:50"]], wed: [["11:00", "12:50"]], thu: [["13:00", "16:50"], ["18:00", "19:50"]], fri: [["13:00", "16:50"]] }, unavailable_rules: [{ date: "2026-06-13", mode: "all" }, { date: "2026-06-14", mode: "all" }, { date: "2026-06-15", mode: "all" }] },
    { id: "joohwan", name: "김주환", short_name: "주환", classes: { mon: [["10:00", "13:50"]], tue: [["10:00", "11:50"], ["13:00", "14:50"]], wed: [["10:00", "11:50"], ["12:00", "12:50"], ["15:00", "16:50"]], thu: [["10:00", "11:50"], ["13:00", "14:50"]], fri: [["13:00", "16:50"]] }, unavailable_rules: [{ date: "2026-06-13", mode: "all" }, { date: "2026-06-15", mode: "all" }, { date: "2026-06-16", unavailable_shifts: ["middle"] }, { date: "2026-06-17", unavailable_shifts: ["middle"] }] },
    { id: "daeyong", name: "이대용", short_name: "대용", classes: { mon: [["16:00", "17:50"]], tue: [["10:00", "15:50"]], wed: [["09:00", "11:50"], ["13:00", "13:50"], ["15:00", "16:50"]], thu: [["15:00", "16:50"]] }, unavailable_rules: [{ date: "2026-06-15", only_shifts: ["open"] }, { date: "2026-06-16", mode: "all" }, { date: "2026-06-17", mode: "all" }, { date: "2026-06-18", mode: "all" }] },
    { id: "hanbyul", name: "배한별", short_name: "한별", classes: { mon: [["09:00", "11:50"], ["13:00", "16:50"]], tue: [["13:00", "15:50"]], thu: [["09:00", "11:50"], ["14:00", "16:50"]], fri: [["09:00", "11:50"]] }, unavailable_rules: [{ date: "2026-06-13", mode: "all" }, { date: "2026-06-16", mode: "all" }, { date: "2026-06-17", mode: "all" }, { date: "2026-06-18", mode: "all" }] },
    { id: "taewoo", name: "김태우", short_name: "태우", classes: { mon: [["16:00", "17:50"]], tue: [["10:00", "15:50"]], wed: [["09:00", "11:50"], ["13:00", "13:50"]], thu: [["15:00", "16:50"]] }, unavailable_rules: [{ date: "2026-06-13", only_shifts: ["open"] }, { date: "2026-06-14", only_shifts: ["open"] }, { date: "2026-06-15", mode: "all" }, { date: "2026-06-16", only_shifts: ["middle"] }, { date: "2026-06-17", mode: "all" }, { date: "2026-06-18", mode: "all" }] },
    { id: "namin", name: "박나민", short_name: "나민", classes: { mon: [["20:00", "22:50"]], tue: [["11:00", "11:50"]], wed: [["13:00", "13:50"], ["14:00", "15:50"]], thu: [["09:00", "10:50"]], fri: [["20:00", "22:50"]] }, unavailable_rules: [{ date: "2026-06-13", unavailable_shifts: ["open"] }, { date: "2026-06-15", mode: "all" }, { date: "2026-06-17", mode: "all" }, { date: "2026-06-18", mode: "all" }] }
  ]
};

let state = {
  config: deepClone(defaultConfig),
  assignments: {},
  shifts: [],
  candidates: {},
  issues: [],
  summary: null,
  selectedAssistantId: "seonghun",
  selectedShiftId: null,
  view: "schedule",
  attempts: 2500,
  seed: 202606
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseTime(value) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function formatTime(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function monthDates(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return Array.from({ length: lastDay }, (_, index) => {
    const day = index + 1;
    return {
      iso: `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      date: new Date(year, monthNumber - 1, day)
    };
  });
}

function buildShifts(config) {
  return monthDates(config.month).flatMap(({ iso, date }) => {
    const dayIndex = date.getDay() === 0 ? 6 : date.getDay() - 1;
    const kind = dayIndex >= 5 ? "weekend" : "weekday";
    return config.rules.shift_templates[kind].map((template, order) => ({
      id: `${iso}:${template.key}`,
      date: iso,
      dayIndex,
      dayName: DAY_NAMES[dayIndex],
      dayKind: kind,
      key: template.key,
      name: template.name,
      start: parseTime(template.start),
      end: parseTime(template.end),
      creditHours: Number(template.credit_hours),
      order
    }));
  });
}

function classConflict(assistant, shift) {
  if (shift.dayIndex >= 5) return false;
  const classes = assistant.classes?.[DAY_KEYS[shift.dayIndex]] || [];
  return classes.some(([start, end]) => overlaps(shift.start, shift.end, parseTime(start), parseTime(end)));
}

function blockedReason(assistant, shift) {
  const rules = assistant.unavailable_rules || [];
  for (const rule of rules) {
    if (rule.date !== shift.date) continue;
    if (rule.mode === "all") return "근무 불가";
    if ((rule.unavailable_shifts || []).includes(shift.key)) return `${shift.name} 불가`;
    if (rule.only_shifts && !rule.only_shifts.includes(shift.key)) return `${rule.only_shifts.map(key => SHIFT_LABELS[key] || key).join(", ")}만 가능`;
  }
  if (classConflict(assistant, shift)) return "수업 시간";
  return "";
}

function buildCandidates(config, shifts) {
  const candidates = {};
  for (const shift of shifts) {
    candidates[shift.id] = config.assistants
      .filter(assistant => !blockedReason(assistant, shift))
      .map(assistant => assistant.id);
  }
  return candidates;
}

function seededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function summarize(config, assignments, shifts) {
  const shiftMap = new Map(shifts.map(shift => [shift.id, shift]));
  const hours = Object.fromEntries(config.assistants.map(assistant => [assistant.id, 0]));
  const counts = Object.fromEntries(config.assistants.map(assistant => [assistant.id, 0]));
  const weekends = Object.fromEntries(config.assistants.map(assistant => [assistant.id, 0]));
  const types = Object.fromEntries(config.assistants.map(assistant => [assistant.id, { open: 0, middle: 0, close: 0, night: 0 }]));

  for (const [shiftId, assistantId] of Object.entries(assignments)) {
    if (assistantId === UNASSIGNED) continue;
    const shift = shiftMap.get(shiftId);
    if (!shift) continue;
    hours[assistantId] += shift.creditHours;
    counts[assistantId] += 1;
    weekends[assistantId] += shift.dayKind === "weekend" ? 1 : 0;
    types[assistantId][shift.key] = (types[assistantId][shift.key] || 0) + 1;
  }

  const values = Object.values(hours);
  const required = shifts.reduce((sum, shift) => sum + shift.creditHours, 0);
  const assigned = Object.entries(assignments).filter(([, id]) => id !== UNASSIGNED).length;
  return {
    hours,
    counts,
    weekends,
    types,
    totalShifts: shifts.length,
    assignedShifts: assigned,
    unassignedShifts: shifts.length - assigned,
    requiredCreditHours: required,
    assignedCreditHours: values.reduce((sum, value) => sum + value, 0),
    minHours: Math.min(...values),
    maxHours: Math.max(...values),
    hourRange: Math.max(...values) - Math.min(...values)
  };
}

function objective(config, assignments, shifts) {
  const summary = summarize(config, assignments, shifts);
  const values = Object.values(summary.hours);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
  return [summary.hourRange, deviation, Math.max(...Object.values(summary.counts)) - Math.min(...Object.values(summary.counts))];
}

function compareObjective(left, right) {
  if (!right) return -1;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

function greedySolve(config, shifts, candidates, random) {
  const assistantIds = config.assistants.map(assistant => assistant.id);
  const assignable = shifts.filter(shift => candidates[shift.id].length > 0);
  const order = [...assignable].sort((a, b) => candidates[a.id].length - candidates[b.id].length || a.date.localeCompare(b.date) || a.order - b.order);
  const target = assignable.reduce((sum, shift) => sum + shift.creditHours, 0) / assistantIds.length;
  const hours = Object.fromEntries(assistantIds.map(id => [id, 0]));
  const counts = Object.fromEntries(assistantIds.map(id => [id, 0]));
  const weekends = Object.fromEntries(assistantIds.map(id => [id, 0]));
  const typeCounts = Object.fromEntries(assistantIds.map(id => [id, {}]));
  const daysWorked = Object.fromEntries(assistantIds.map(id => [id, new Set()]));
  const assignments = {};

  for (const shift of order) {
    const possible = candidates[shift.id].filter(id => !daysWorked[id].has(shift.date));
    if (!possible.length) return null;
    const selected = possible.reduce((best, id) => {
      const projected = hours[id] + shift.creditHours;
      const score = projected
        + Math.max(0, projected - target) * 1.8
        + counts[id] * 0.2
        + weekends[id] * (shift.dayKind === "weekend" ? 0.55 : 0.06)
        + (typeCounts[id][shift.key] || 0) * 0.38
        + random() * 1.4;
      return !best || score < best.score ? { id, score } : best;
    }, null).id;
    assignments[shift.id] = selected;
    hours[selected] += shift.creditHours;
    counts[selected] += 1;
    weekends[selected] += shift.dayKind === "weekend" ? 1 : 0;
    typeCounts[selected][shift.key] = (typeCounts[selected][shift.key] || 0) + 1;
    daysWorked[selected].add(shift.date);
  }

  for (const shift of shifts) {
    if (!assignments[shift.id]) assignments[shift.id] = UNASSIGNED;
  }
  return assignments;
}

function solve(config, attempts, seed) {
  const shifts = buildShifts(config);
  const candidates = buildCandidates(config, shifts);
  let best = null;
  let bestObjective = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const random = seededRandom(seed + attempt * 9973);
    const assignments = greedySolve(config, shifts, candidates, random);
    if (!assignments) continue;
    const currentObjective = objective(config, assignments, shifts);
    if (compareObjective(currentObjective, bestObjective) < 0) {
      best = assignments;
      bestObjective = currentObjective;
    }
  }
  if (!best) {
    best = Object.fromEntries(shifts.map(shift => [shift.id, candidates[shift.id][0] || UNASSIGNED]));
  }
  return { assignments: best, shifts, candidates };
}

function validate(config, assignments, shifts, candidates) {
  const issues = [];
  const perDay = {};
  for (const shift of shifts) {
    const assistantId = assignments[shift.id];
    if (assistantId === UNASSIGNED) {
      issues.push(`${shift.date} ${shift.name}: 배정 가능한 조교 없음`);
      continue;
    }
    if (!candidates[shift.id].includes(assistantId)) {
      issues.push(`${shift.date} ${shift.name}: 배정 조건 위반`);
    }
    const dayKey = `${shift.date}:${assistantId}`;
    perDay[dayKey] = (perDay[dayKey] || 0) + 1;
  }
  for (const [key, count] of Object.entries(perDay)) {
    if (count > 1) issues.push(`${key.split(":")[0]}: 하루 ${count}회 배정`);
  }
  const summary = summarize(config, assignments, shifts);
  if (summary.hourRange > Number(config.rules.fairness_tolerance_hours || 10)) {
    issues.push(`월간 시간 편차 ${summary.hourRange.toFixed(1)}시간`);
  }
  return issues;
}

function regenerate() {
  const result = solve(state.config, state.attempts, state.seed);
  state.assignments = result.assignments;
  state.shifts = result.shifts;
  state.candidates = result.candidates;
  state.summary = summarize(state.config, state.assignments, state.shifts);
  state.issues = validate(state.config, state.assignments, state.shifts, state.candidates);
  render();
}

function syncInputs() {
  document.querySelector("#monthInput").value = state.config.month;
  document.querySelector("#toleranceInput").value = state.config.rules.fairness_tolerance_hours;
  document.querySelector("#attemptsInput").value = state.attempts;
  document.querySelector("#seedInput").value = state.seed;
}

function render() {
  syncInputs();
  state.summary = summarize(state.config, state.assignments, state.shifts);
  state.issues = validate(state.config, state.assignments, state.shifts, state.candidates);
  renderMetrics();
  renderShiftTemplates();
  renderAssistantList();
  renderAssistantEditor();
  renderSchedule();
  renderPeople();
  renderInspector();
}

function renderMetrics() {
  const summary = state.summary;
  const issueClass = state.issues.length ? "status-bad" : "status-ok";
  document.querySelector("#metrics").innerHTML = [
    ["근무", `${summary.assignedShifts}/${summary.totalShifts}`],
    ["인정 시간", `${summary.assignedCreditHours.toFixed(0)}/${summary.requiredCreditHours.toFixed(0)}`],
    ["시간 편차", `${summary.hourRange.toFixed(1)}`],
    ["범위", `${summary.minHours.toFixed(0)}-${summary.maxHours.toFixed(0)}`],
    ["검증", `<span class="${issueClass}">${state.issues.length ? `${state.issues.length}건` : "통과"}</span>`]
  ].map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function renderShiftTemplates() {
  const groups = [["weekday", "평일"], ["weekend", "주말"]];
  document.querySelector("#shiftTemplates").innerHTML = groups.map(([kind, label]) => `
    <div class="template-group">
      <h3>${label}</h3>
      ${state.config.rules.shift_templates[kind].map((template, index) => `
        <div class="template-row" data-kind="${kind}" data-index="${index}">
          <label><span>이름</span><input data-field="name" value="${escapeAttr(template.name)}"></label>
          <label><span>시작</span><input data-field="start" value="${template.start}"></label>
          <label><span>종료</span><input data-field="end" value="${template.end}"></label>
          <label><span>시간</span><input type="number" min="0" step="0.5" data-field="credit_hours" value="${template.credit_hours}"></label>
        </div>
      `).join("")}
    </div>
  `).join("");
}

function renderAssistantList() {
  const assistants = state.config.assistants;
  document.querySelector("#assistantList").innerHTML = assistants.map(assistant => {
    const hours = state.summary.hours[assistant.id] || 0;
    return `
      <button class="assistant-item ${assistant.id === state.selectedAssistantId ? "active" : ""}" data-assistant="${assistant.id}" type="button">
        <span><strong>${escapeHtml(assistant.name)}</strong><small>${escapeHtml(assistant.short_name)}</small></span>
        <span class="assistant-hours">${hours.toFixed(0)}h</span>
      </button>
    `;
  }).join("");
}

function renderAssistantEditor() {
  const assistant = selectedAssistant();
  if (!assistant) {
    document.querySelector("#assistantEditor").innerHTML = `<div class="muted-box">조교를 선택하세요.</div>`;
    return;
  }
  const classRows = DAY_KEYS.slice(0, 5).flatMap(day => (assistant.classes?.[day] || []).map((time, index) => ({ day, time, index })));
  const unavailableRows = assistant.unavailable_rules || [];
  document.querySelector("#assistantEditor").innerHTML = `
    <div class="editor-stack">
      <div class="editor-row">
        <label><span>이름</span><input id="assistantName" value="${escapeAttr(assistant.name)}"></label>
        <label><span>표시명</span><input id="assistantShortName" value="${escapeAttr(assistant.short_name)}"></label>
      </div>
      <div class="subtle-heading"><h3>수업 시간</h3><button id="addClass" class="small-button" type="button">추가</button></div>
      <div class="mini-table">
        ${classRows.map(row => `
          <div class="mini-row" data-day="${row.day}" data-class-index="${row.index}">
            <select data-class-field="day">${DAY_KEYS.slice(0, 5).map((day, idx) => `<option value="${day}" ${day === row.day ? "selected" : ""}>${DAY_NAMES[idx]}</option>`).join("")}</select>
            <input type="time" data-class-field="start" value="${row.time[0]}">
            <input type="time" data-class-field="end" value="${row.time[1]}">
            <button class="icon-button danger" data-remove-class type="button">×</button>
          </div>
        `).join("") || `<div class="muted-box">등록된 수업 시간이 없습니다.</div>`}
      </div>
      <div class="subtle-heading"><h3>근무 불가</h3><button id="addUnavailable" class="small-button" type="button">추가</button></div>
      <div class="mini-table">
        ${unavailableRows.map((rule, index) => {
          const mode = rule.mode === "all" ? "all" : rule.only_shifts ? "only" : "blocked";
          const shifts = (rule.only_shifts || rule.unavailable_shifts || []).join(",");
          return `
            <div class="mini-row unavailable" data-rule-index="${index}">
              <input type="date" data-rule-field="date" value="${rule.date || state.config.month + "-01"}">
              <select data-rule-field="mode">
                <option value="all" ${mode === "all" ? "selected" : ""}>전체</option>
                <option value="blocked" ${mode === "blocked" ? "selected" : ""}>불가</option>
                <option value="only" ${mode === "only" ? "selected" : ""}>가능</option>
              </select>
              <input data-rule-field="shifts" value="${escapeAttr(shifts)}" placeholder="open,middle">
              <button class="icon-button danger" data-remove-rule type="button">×</button>
            </div>
          `;
        }).join("") || `<div class="muted-box">등록된 근무 불가가 없습니다.</div>`}
      </div>
      <button id="removeAssistant" class="danger" type="button">조교 삭제</button>
    </div>
  `;
}

function renderSchedule() {
  document.querySelector("#scheduleTitle").textContent = `${state.config.month} 근무표`;
  document.querySelector("#scheduleStatus").innerHTML = state.issues.length
    ? `<span class="status-bad">${state.issues[0]}</span>`
    : `<span class="status-ok">조건을 통과했습니다.</span>`;

  const assistants = Object.fromEntries(state.config.assistants.map(assistant => [assistant.id, assistant]));
  const byDate = {};
  for (const shift of state.shifts) {
    byDate[shift.date] ||= [];
    byDate[shift.date].push(shift);
  }
  const rows = Object.entries(byDate).map(([date, shifts]) => {
    const shiftCells = ["open", "middle", "close", "night"].map(key => {
      const shift = shifts.find(item => item.key === key);
      if (!shift) return `<td class="shift-cell"></td>`;
      const assistantId = state.assignments[shift.id];
      const assistant = assistants[assistantId];
      const isUnassigned = assistantId === UNASSIGNED;
      const selected = state.selectedShiftId === shift.id;
      return `
        <td class="shift-cell">
          <button class="shift-button ${isUnassigned ? "unassigned" : ""} ${selected ? "selected" : ""}" data-shift="${shift.id}" type="button">
            <strong>${isUnassigned ? "미배정" : escapeHtml(assistant.short_name)}</strong>
            <small>${formatTime(shift.start)}-${formatTime(shift.end)} · ${shift.creditHours}h</small>
          </button>
        </td>
      `;
    }).join("");
    const dayName = shifts[0]?.dayName || "";
    return `<tr><th class="date-cell">${date.slice(5)}<small>${dayName}</small></th>${shiftCells}</tr>`;
  }).join("");

  document.querySelector("#scheduleView").innerHTML = `
    <table class="schedule-table">
      <thead><tr><th>날짜</th><th>오픈</th><th>미들</th><th>마감</th><th>야간</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderPeople() {
  const maxHours = Math.max(...Object.values(state.summary.hours), 1);
  const rows = state.config.assistants.map(assistant => {
    const hours = state.summary.hours[assistant.id] || 0;
    const assignments = state.shifts
      .filter(shift => state.assignments[shift.id] === assistant.id)
      .sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order)
      .map(shift => `<span class="person-pill"><strong>${shift.date.slice(5)} ${shift.name}</strong><small>${formatTime(shift.start)}-${formatTime(shift.end)}</small></span>`)
      .join("");
    return `
      <tr>
        <th>${escapeHtml(assistant.name)}</th>
        <td>${hours.toFixed(1)}</td>
        <td><div class="bar"><span style="width:${Math.max(6, hours / maxHours * 100)}%"></span></div></td>
        <td>${assignments}</td>
      </tr>
    `;
  }).join("");
  document.querySelector("#peopleView").innerHTML = `
    <table class="people-table">
      <thead><tr><th>조교</th><th>시간</th><th>분포</th><th>근무</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderInspector() {
  const container = document.querySelector("#shiftInspector");
  const shift = state.shifts.find(item => item.id === state.selectedShiftId);
  if (!shift) {
    container.innerHTML = "근무 칸을 선택하세요.";
    container.className = "shift-inspector muted-box";
    return;
  }
  container.className = "shift-inspector";
  const assigned = state.assignments[shift.id];
  container.innerHTML = `
    <h3>${shift.date} ${shift.name}</h3>
    <p class="reason">${formatTime(shift.start)}-${formatTime(shift.end)} · ${shift.creditHours}h</p>
    <div class="candidate-list">
      <button class="candidate-button ${assigned === UNASSIGNED ? "assigned" : ""}" data-assign="${UNASSIGNED}" type="button">
        <span><strong>미배정</strong><span class="reason">비워두기</span></span>
      </button>
      ${state.config.assistants.map(assistant => {
        const reason = blockedReason(assistant, shift);
        const sameDay = Object.entries(state.assignments).some(([shiftId, assistantId]) => {
          const other = state.shifts.find(item => item.id === shiftId);
          return assistantId === assistant.id && other?.date === shift.date && shiftId !== shift.id;
        });
        const disabled = reason || sameDay;
        return `
          <button class="candidate-button ${assigned === assistant.id ? "assigned" : ""} ${disabled ? "disabled" : ""}" data-assign="${assistant.id}" data-disabled="${disabled ? "1" : "0"}" type="button">
            <span><strong>${escapeHtml(assistant.name)}</strong><span class="reason">${disabled ? reason || "같은 날 배정됨" : "배정 가능"}</span></span>
            <span>${(state.summary.hours[assistant.id] || 0).toFixed(0)}h</span>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function selectedAssistant() {
  return state.config.assistants.find(assistant => assistant.id === state.selectedAssistantId);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function normalizeShiftKeys(value) {
  return value.split(",").map(item => item.trim()).filter(Boolean);
}

function updateRuleFromRow(row) {
  const assistant = selectedAssistant();
  const index = Number(row.dataset.ruleIndex);
  const date = row.querySelector('[data-rule-field="date"]').value;
  const mode = row.querySelector('[data-rule-field="mode"]').value;
  const shifts = normalizeShiftKeys(row.querySelector('[data-rule-field="shifts"]').value);
  const rule = { date };
  if (mode === "all") rule.mode = "all";
  if (mode === "blocked") rule.unavailable_shifts = shifts;
  if (mode === "only") rule.only_shifts = shifts;
  assistant.unavailable_rules[index] = rule;
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportCsv() {
  const assistants = Object.fromEntries(state.config.assistants.map(assistant => [assistant.id, assistant]));
  const header = ["date", "day", "shift", "start", "end", "credit_hours", "assistant"];
  const rows = state.shifts.map(shift => {
    const assistant = assistants[state.assignments[shift.id]];
    return [shift.date, shift.dayName, shift.name, formatTime(shift.start), formatTime(shift.end), shift.creditHours, assistant?.name || "미배정"];
  });
  const csv = [header, ...rows].map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
  download(`${state.config.month.replace("-", "_")}_schedule.csv`, "\ufeff" + csv, "text/csv;charset=utf-8");
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function bindEvents() {
  document.querySelector("#generate").addEventListener("click", () => {
    regenerate();
    showToast("근무표를 다시 생성했습니다.");
  });

  document.querySelector("#monthInput").addEventListener("change", event => {
    state.config.month = event.target.value;
    regenerate();
  });
  document.querySelector("#toleranceInput").addEventListener("change", event => {
    state.config.rules.fairness_tolerance_hours = Number(event.target.value);
    render();
  });
  document.querySelector("#attemptsInput").addEventListener("change", event => {
    state.attempts = Number(event.target.value);
  });
  document.querySelector("#seedInput").addEventListener("change", event => {
    state.seed = Number(event.target.value);
  });

  document.querySelector("#exportCsv").addEventListener("click", exportCsv);
  document.querySelector("#exportJson").addEventListener("click", () => {
    download(`${state.config.month.replace("-", "_")}_config.json`, JSON.stringify(state.config, null, 2), "application/json;charset=utf-8");
  });
  document.querySelector("#importJson").addEventListener("change", event => {
    const file = event.target.files[0];
    if (!file) return;
    file.text().then(text => {
      state.config = JSON.parse(text);
      state.selectedAssistantId = state.config.assistants[0]?.id || "";
      regenerate();
      showToast("설정을 불러왔습니다.");
    });
  });

  document.querySelector("#addAssistant").addEventListener("click", () => {
    const id = `assistant_${Date.now()}`;
    state.config.assistants.push({ id, name: "새 조교", short_name: "신규", classes: {}, unavailable_rules: [] });
    state.selectedAssistantId = id;
    regenerate();
  });

  document.querySelector("#viewSchedule").addEventListener("click", () => setView("schedule"));
  document.querySelector("#viewPeople").addEventListener("click", () => setView("people"));

  document.body.addEventListener("click", event => {
    const assistantButton = event.target.closest("[data-assistant]");
    if (assistantButton) {
      state.selectedAssistantId = assistantButton.dataset.assistant;
      render();
      return;
    }
    const shiftButton = event.target.closest("[data-shift]");
    if (shiftButton) {
      state.selectedShiftId = shiftButton.dataset.shift;
      render();
      return;
    }
    const assignButton = event.target.closest("[data-assign]");
    if (assignButton && assignButton.dataset.disabled !== "1") {
      state.assignments[state.selectedShiftId] = assignButton.dataset.assign;
      render();
      return;
    }
    if (event.target.id === "addClass") {
      const assistant = selectedAssistant();
      assistant.classes.mon ||= [];
      assistant.classes.mon.push(["09:00", "09:50"]);
      render();
      return;
    }
    if (event.target.id === "addUnavailable") {
      const assistant = selectedAssistant();
      assistant.unavailable_rules ||= [];
      assistant.unavailable_rules.push({ date: `${state.config.month}-01`, mode: "all" });
      render();
      return;
    }
    if (event.target.id === "removeAssistant") {
      state.config.assistants = state.config.assistants.filter(assistant => assistant.id !== state.selectedAssistantId);
      state.selectedAssistantId = state.config.assistants[0]?.id || "";
      regenerate();
      return;
    }
    if (event.target.matches("[data-remove-class]")) {
      const assistant = selectedAssistant();
      const row = event.target.closest("[data-class-index]");
      const day = row.dataset.day;
      assistant.classes[day].splice(Number(row.dataset.classIndex), 1);
      regenerate();
      return;
    }
    if (event.target.matches("[data-remove-rule]")) {
      const assistant = selectedAssistant();
      const row = event.target.closest("[data-rule-index]");
      assistant.unavailable_rules.splice(Number(row.dataset.ruleIndex), 1);
      regenerate();
    }
  });

  document.body.addEventListener("change", event => {
    const templateRow = event.target.closest(".template-row");
    if (templateRow && event.target.dataset.field) {
      const template = state.config.rules.shift_templates[templateRow.dataset.kind][Number(templateRow.dataset.index)];
      const field = event.target.dataset.field;
      template[field] = field === "credit_hours" ? Number(event.target.value) : event.target.value;
      regenerate();
      return;
    }
    const classRow = event.target.closest("[data-class-index]");
    if (classRow && event.target.dataset.classField) {
      const assistant = selectedAssistant();
      const oldDay = classRow.dataset.day;
      const index = Number(classRow.dataset.classIndex);
      const newDay = classRow.querySelector('[data-class-field="day"]').value;
      const start = classRow.querySelector('[data-class-field="start"]').value;
      const end = classRow.querySelector('[data-class-field="end"]').value;
      const current = assistant.classes[oldDay].splice(index, 1)[0] || [start, end];
      current[0] = start;
      current[1] = end;
      assistant.classes[newDay] ||= [];
      assistant.classes[newDay].push(current);
      regenerate();
      return;
    }
    const ruleRow = event.target.closest("[data-rule-index]");
    if (ruleRow && event.target.dataset.ruleField) {
      updateRuleFromRow(ruleRow);
      regenerate();
    }
  });

  document.body.addEventListener("input", event => {
    const assistant = selectedAssistant();
    if (!assistant) return;
    if (event.target.id === "assistantName") {
      assistant.name = event.target.value;
      renderAssistantList();
      renderSchedule();
      renderPeople();
    }
    if (event.target.id === "assistantShortName") {
      assistant.short_name = event.target.value;
      renderAssistantList();
      renderSchedule();
      renderPeople();
    }
  });
}

function setView(view) {
  state.view = view;
  document.querySelector("#viewSchedule").classList.toggle("active", view === "schedule");
  document.querySelector("#viewPeople").classList.toggle("active", view === "people");
  document.querySelector("#scheduleView").classList.toggle("hidden", view !== "schedule");
  document.querySelector("#peopleView").classList.toggle("hidden", view !== "people");
}

bindEvents();
regenerate();
