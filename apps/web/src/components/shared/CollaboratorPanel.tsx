import { suggestedIdentities, type Identity } from "@/lib/identity";
import {
  formatRelativeTime,
  type ActivityEntry,
  type DraftInfo,
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
  draft,
  draftLoading,
  draftStatus,
  onSaveDraft,
  onLoadDraft,
  identityMissing
}: {
  online: PresenceRow[];
  activity: ActivityEntry[];
  rosterStatus: SyncStatus;
  rosterUpdateAvailable: { updatedBy: string } | null;
  onReloadRoster: () => void;
  draft: DraftInfo | null;
  draftLoading: boolean;
  draftStatus: SyncStatus;
  onSaveDraft: () => void;
  onLoadDraft: () => void;
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
        {draftLoading ? (
          <p className="mutedNote">불러오는 중…</p>
        ) : draft ? (
          <div className="draftPeek">
            <p>
              <strong>{draft.updatedBy}</strong>님이 {formatRelativeTime(draft.updatedAt)} 저장
              {draft.summary && typeof draft.summary.assignedShifts === "number" ? (
                <> · 배정 {String(draft.summary.assignedShifts)}/{String(draft.summary.totalShifts)}</>
              ) : null}
            </p>
            <button type="button" onClick={onLoadDraft}>
              이 버전 불러오기
            </button>
          </div>
        ) : (
          <p className="mutedNote">아직 서버에 공유 저장된 버전이 없습니다.</p>
        )}
        <button type="button" className="shareSaveButton" disabled={identityMissing || draftStatus === "saving"} onClick={onSaveDraft}>
          {draftStatus === "saving" ? "저장 중…" : "지금 상태 동료와 공유 저장"}
        </button>
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
