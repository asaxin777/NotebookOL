export type LocalRole = "admin" | "user";

export type LocalAccount = {
  id: string;
  email: string;
  role: LocalRole;
  createdAt: string;
};
