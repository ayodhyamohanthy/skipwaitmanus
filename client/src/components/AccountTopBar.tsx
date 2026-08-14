import { Brand } from "@/components/Brand";
import { AccountMenu } from "@/components/AccountMenu";

export function AccountTopBar() {
  return <div className="flex items-center justify-between gap-3"><Brand /><AccountMenu /></div>;
}
