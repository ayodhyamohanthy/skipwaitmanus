import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SkipWaitShell } from "@/components/skipwait-shell";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5">
      <div className="max-w-md text-center">
        <p className="wordmark text-2xl">SkipWait<span className="brand-dot">.</span></p>
        <h1 className="mt-8 text-4xl font-semibold text-foreground">This door doesn't lead anywhere.</h1>
        <p className="mt-3 text-muted-foreground">The page may have moved, or the link was mistyped.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <Link to="/explore" className="inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-semibold text-primary-foreground">Explore companies</Link>
          <Link to="/" className="inline-flex min-h-11 items-center rounded-full border border-border px-6 font-semibold text-foreground">Go home</Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5">
      <div className="max-w-md text-center">
        <p className="wordmark text-2xl">SkipWait<span className="brand-dot">.</span></p>
        <h1 className="mt-8 text-3xl font-semibold text-foreground">Something went wrong on our side.</h1>
        <p className="mt-3 text-muted-foreground">Nothing you did. Your asks and messages are safe.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <button onClick={() => { router.invalidate(); reset(); }} className="inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-semibold text-primary-foreground">Try again</button>
          <a href="/" className="inline-flex min-h-11 items-center rounded-full border border-border px-6 font-semibold text-foreground">Go home</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "SkipWait — A warmer way in" },
      { name: "description", content: "Private connections. Free job referrals. A warmer way to your next chapter." },
      { name: "author", content: "SkipWait" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: "try{if(localStorage.getItem('sw-theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}" }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const isStandalone = useRouterState({ select: state => (["/", "/sign-in", "/admin", "/for-companies"].includes(state.location.pathname) || state.location.pathname.startsWith("/p/") || ["/admin-review","/terms","/privacy","/guidelines","/employer","/emails","/forgot-password","/reset-password","/connect-assistant","/developers","/developer-console"].includes(state.location.pathname)) });

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      {isStandalone ? <Outlet /> : <SkipWaitShell><Outlet /></SkipWaitShell>}
    </QueryClientProvider>
  );
}
