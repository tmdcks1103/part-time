import { suggestedIdentities, type Identity } from "@/lib/identity";
import {
  formatRelativeTime,
  type ActivityEntry,
  type PresenceRow,
  type SyncStatus
} from "@/lib/collab";

const pageLabels: Record<string, string> = {
  month: "월간 편성",
  period: "기간 편성"
};

const statusLabels: Record<SyncStatus, string> = {
  idle: "",
  saving: "저장 중…",
  saved: "저장됨",
  error: "저장 실패"
};

export function IdentityPicker({ identity, onChange }: { identity: Identity | null; onChange: (identity: Identity) => void }) {
  return (
    <div className="identityPicker">
      <span>나</span>
      <select
        value={identity?.name ?? ""}
        onChange={(event) => {
          const found = suggestedIdentities.find((entry) => entry.name === event.target.value);
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
    </div>
  );
}

export function CollaboratorPanel({
  online,
  activity,
  rosterStatus,
  rosterUpdateAvailable,
  onReloadRoster,
  draftStatus,
  draftUpdateAvailable,
  onReloadDraft,
  draftRemoteMeta,
  summary,
  identityMissing
}: {
  online: PresenceRow[];
  activity: ActivityEntry[];
  rosterStatus: SyncStatus;
  rosterUpdateAvailable: { updatedBy: string } | null;
  onReloadRoster: () => void;
  draftStatus: SyncStatus;
  draftUpdateAvailable: { updatedBy: string } | null;
  onReloadDraft: () => void;
  draftRemoteMeta: { updatedAt: string | null; updatedBy: string | null };
  summary?: { assignedShifts: number; totalShifts: number };
  identityMissing: boolean;
}) {
  return (
    <section className="panelBlock collaboratorPanel">
      <div className="blockTitle">
        <h2>동료 현황</h2>
        {rosterStatus !== "idle" ? <small className={`syncStatus syncStatus-${rosterStatus}`}>{statusLabels[rosterStatus]}</small> : null}
      </div>

      {identityMissing ? (
        <div className="emptyBox">상단에서 이름을 선택하면 활동이 기록되고 동료 현황을 함께 볼 수 있습니다.</div>
      ) : null}

      {rosterUpdateAvailable ? (
        <div className="updateBanner">
          <span>{rosterUpdateAvailable.updatedBy}님이 조교 명단을 방금 수정했습니다.</span>
          <button type="button" onClick={onReloadRoster}>
            반영하기
          </button>
        </div>
      ) : null}

      {draftUpdateAvailable ? (
        <div className="updateBanner">
          <span>{draftUpdateAvailable.updatedBy}님이 이 근무표를 방금 저장했습니다.</span>
          <button type="button" onClick={onReloadDraft}>
            반영하기
          </button>
        </div>
      ) : null}

      <div className="collabBlock">
        <h3>지금 함께 보는 중</h3>
        {online.length ? (
          <ul className="presenceList">
            {online.map((row) => (
              <li key={row.actor_name}>
                <strong>{row.actor_name}</strong>
                <span>{pageLabels[row.page] ?? row.page} · {formatRelativeTime(row.last_seen_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mutedNote">지금은 나 혼자 보고 있어요.</p>
        )}
      </div>

      <div className="collabBlock">
        <h3>이 근무표 근황</h3>
        {draftRemoteMeta.updatedAt ? (
          <p className="mutedNote">
            {draftRemoteMeta.updatedBy ? <>{draftRemoteMeta.updatedBy}님이 </> : null}
            {formatRelativeTime(draftRemoteMeta.updatedAt)} 자동 저장됨
            {summary ? <> · 배정 {summary.assignedShifts}/{summary.totalShifts}</> : null}
            {draftStatus === "saving" ? " · 저장 중…" : null}
          </p>
        ) : (
          <p className="mutedNote">편집하면 자동으로 저장됩니다.{summary ? ` (현재 배정 ${summary.assignedShifts}/${summary.totalShifts})` : ""}</p>
        )}
      </div>

      <div className="collabBlock">
        <h3>최근 활동</h3>
        {activity.length ? (
          <ul className="activityFeed">
            {activity.map((entry) => (
              <li key={entry.id}>
                <span className="activityTime">{formatRelativeTime(entry.created_at)}</span>
                <span>
                  <strong>{entry.actor_name}</strong> · {entry.action}
                  {entry.detail ? ` · ${entry.detail}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mutedNote">아직 기록된 활동이 없습니다.</p>
        )}
      </div>
    </section>
  );
}
