export type UserRole = "admin" | "scheduler" | "assistant" | "viewer";

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  assistantId?: string;
}

export const demoUsers: AppUser[] = [
  {
    id: "u_scheduler",
    email: "scheduler@dorm.local",
    name: "근무표 담당자",
    role: "scheduler"
  },
  {
    id: "u_admin",
    email: "admin@dorm.local",
    name: "관리자",
    role: "admin"
  },
  {
    id: "u_seonghun",
    email: "seonghun@dorm.local",
    name: "김성훈",
    role: "assistant",
    assistantId: "seonghun"
  }
];

export function getDemoUser(role: UserRole = "scheduler"): AppUser {
  return demoUsers.find((user) => user.role === role) ?? demoUsers[0];
}

export function canManageSchedule(role: UserRole): boolean {
  return role === "admin" || role === "scheduler";
}

export function canManageUsers(role: UserRole): boolean {
  return role === "admin";
}
