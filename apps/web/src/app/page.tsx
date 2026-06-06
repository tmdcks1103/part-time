import { ScheduleProduct } from "@/components/ScheduleProduct";
import { getDemoUser } from "@/lib/auth";
import { getInitialWorkspace } from "@/lib/schedule-store";

export default function Page() {
  const workspace = getInitialWorkspace();

  return (
    <ScheduleProduct
      initialConfig={workspace.config}
      versions={workspace.versions}
      initialUser={getDemoUser("scheduler")}
    />
  );
}
