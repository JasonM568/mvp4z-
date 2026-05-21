import { AdminShell } from "./_shell";

export const metadata = {
  title: "巽風後台"
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
