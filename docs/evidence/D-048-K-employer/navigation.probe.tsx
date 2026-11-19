// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import EmployerDashboard from "./EmployerDashboard";

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
}));

afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it.each([
  { design: "Kit", override: "", spendHeading: "Credit activity · last 30 days" },
  { design: "released goal", override: "employer", spendHeading: "Spend · last 30 days" },
])("keeps all employer tool links for an established employer in $design", async ({ override, spendHeading }) => {
  vi.stubEnv("VITE_GOAL_SURFACES", override);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    switch (String(input)) {
      case "/api/employer/account": return Response.json({ account: { id: 7, companyName: "Northwind Robotics", billingEmail: "hiring@northwind.example", credits: 8, budgetMonthlyUsdCents: 5000, approvalStatus: "approved" } });
      case "/api/employer/opportunities": return Response.json({ opportunities: [{ id: 4, isActive: true, isSponsored: false }] });
      case "/api/employer/spend-history": return Response.json({ spend: [] });
      default: throw new Error("Unexpected fixture request");
    }
  }));
  render(<QueryClientProvider client={new QueryClient()}><EmployerDashboard /></QueryClientProvider>);
  await screen.findByRole("heading", { name: spendHeading });
  const destinations = new Set(screen.getAllByRole("link").map(link => link.getAttribute("href")));
  expect([...destinations].sort()).toEqual([
    "/", "/employer", "/employer/billing", "/employer/opportunities", "/employer/talent", "/for-companies",
  ]);
});
