// A /plans link: an in-page anchor ("#credits", the credit packs on this
// screen) stays a plain link so the browser scrolls to it; any other path goes
// through the router like every other kit link.
import type { ComponentProps } from "react";
import { Link } from "wouter";

export function PlansLink({ href, ...rest }: ComponentProps<"a"> & { href: string }) {
  return href.startsWith("#") ? <a href={href} {...rest} /> : <Link href={href} {...rest} />;
}
