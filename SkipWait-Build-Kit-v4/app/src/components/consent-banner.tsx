import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function ConsentBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => { try { setShow(!localStorage.getItem("sw-consent")); } catch { /* ignore */ } }, []);
  if (!show) return null;
  const save = (v: string) => { try { localStorage.setItem("sw-consent", v); } catch { /* ignore */ } setShow(false); };
  return <div role="dialog" aria-label="Cookie choices" className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-xl rounded-3xl border border-border bg-card p-5 shadow-xl md:bottom-6">
    <p className="text-sm"><strong>Cookies, honestly.</strong> Essential ones keep you signed in. Optional analytics help us improve — never sold, never ads. <Link to="/privacy" className="text-link">Privacy</Link></p>
    <div className="mt-4 flex flex-wrap justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => save("essential")}>Essential only</Button><Button size="sm" onClick={() => save("all")}>Accept all</Button></div>
  </div>;
}
