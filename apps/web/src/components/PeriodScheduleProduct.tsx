import type { SchedulerConfig } from "@part-time/scheduler-core";
import type { AppUser } from "@/lib/auth";
import { ScheduleProduct } from "./ScheduleProduct";

export function PeriodScheduleProduct(props: {
  initialConfig: SchedulerConfig;
  initialUser: AppUser;
}) {
  return <ScheduleProduct {...props} mode="period" />;
}
