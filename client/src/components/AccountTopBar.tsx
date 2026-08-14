import { Brand } from "@/components/Brand";
import { AccountStatus } from "@/components/AccountStatus";

export function AccountTopBar() {
  return <div className="flex items-center justify-between gap-3"><Brand /><AccountStatus /></div>;
}
