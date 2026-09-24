import { suggestedIdentities, type Identity } from "@/lib/identity";
import {
  usePresence,
  useActivityFeed,
  formatRelativeTime,
  type SyncStatus,
} from "@/lib/collab";

const labels: Record<SyncStatus, string> = {
  idle: "대기",
  loading: "불러오는 중",
  local: "이 기기에 저장됨",
  saving: "서버 저장 중",
  saved: "동기화 완료",
  error: "서버 연결 확인 필요",
  conflict: "다른 편집과 충돌",
};
export function IdentityPicker({
  identity,
  onChange,
}: {
  identity: Identity | null;
  onChange: (identity: Identity) => void;
}) {
  return (
    <label className="identityPicker">
      <span>편집자</span>
      <select
        value={identity?.name ?? ""}
        onChange={(e) => {
          const found = suggestedIdentities.find(
            (entry) => entry.name === e.target.value,
          );
          if (found) onChange(found);
        }}
      >
        <option value="" disabled>
          이름 선택
        </option>
        {suggestedIdentities.map((entry) => (
          <option key={entry.name} value={entry.name}>
            {entry.name}
          </option>
        ))}
      </select>
    </label>
  );
}
export function SyncNotice({
  label,
  sync,
}: {
  label: string;
  sync: {
    status: SyncStatus;
    updateAvailable: { updatedBy: string } | null;
    reloadFromServer: () => void;
    retry: () => void;
  };
}) {
  return (
    <div className={`syncStatus syncStatus-${sync.status}`} role="status">
      <span className="statusDot" />
      {label} · {labels[sync.status]}
      {sync.updateAvailable || sync.status === "error" ? (
        <button onClick={sync.status === "error" ? sync.retry : sync.reloadFromServer}>
          {sync.status === "error" ? "다시 연결" : "서버 내용 확인"}
        </button>
      ) : null}
    </div>
  );
}

export function CollaborationDetails({
  scopeKey,
  mode,
  identity,
}: {
  scopeKey: string;
  mode: "month" | "period";
  identity: Identity | null;
}) {
  const { online } = usePresence(mode, scopeKey, identity);
  const activity = useActivityFeed(10);
  return (
    <details className="panelBlock">
      <summary>
        동료와 활동{" "}
        {online.length ? (
          <span className="countBadge">{online.length}명 접속 중</span>
        ) : null}
      </summary>
      <div className="editorStack">
        <p className="mutedNote">
          {online.length
            ? online.map((person) => person.actor_name).join(", ")
            : "현재 다른 접속자가 없습니다."}
        </p>
        <ul className="activityFeed">
          {activity.map((entry) => (
            <li key={entry.id}>
              <strong>{entry.actor_name}</strong> · {entry.action}
              <small>
                {entry.detail} · {formatRelativeTime(entry.created_at)}
              </small>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
