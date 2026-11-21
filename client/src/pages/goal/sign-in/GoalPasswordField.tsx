import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { PASSWORD_MAX } from "@shared/passwordAuth";
import { GoalField, GoalTextInput } from "@/components/goal/GoalField";

export function GoalPasswordField({ id, label, value, onChange, current = false }: {
  id: string; label: string; value: string; onChange: (value: string) => void; current?: boolean;
}) {
  const [show, setShow] = useState(false);
  return <GoalField label={label} htmlFor={id}>
    <div className="relative">
      <GoalTextInput id={id} name={current ? "password" : "new-password"} type={show ? "text" : "password"}
        autoComplete={current ? "current-password" : "new-password"} maxLength={PASSWORD_MAX} required value={value}
        className="pr-12" onChange={event => onChange(event.target.value)} />
      <button type="button" aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} onClick={() => setShow(value => !value)}
        className="absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center text-g-ink-2 hover:text-g-ink">
        {show ? <EyeOff aria-hidden="true" className="size-4" strokeWidth={1.75} /> : <Eye aria-hidden="true" className="size-4" strokeWidth={1.75} />}
      </button>
    </div>
  </GoalField>;
}
