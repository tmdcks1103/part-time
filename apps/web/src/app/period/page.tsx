import { PeriodScheduleProduct } from "@/components/PeriodScheduleProduct";
import { getDemoUser } from "@/lib/auth";
import { getInitialWorkspace } from "@/lib/schedule-store";

export default function PeriodPage() {
  const workspace = getInitialWorkspace();

  return (
    <PeriodScheduleProduct
      initialConfig={workspace.config}
      initialUser={getDemoUser("scheduler")}
    />
  );
}
