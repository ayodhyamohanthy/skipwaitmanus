import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import Onboarding from "./pages/Onboarding";
import ReferralRequest from "./pages/ReferralRequest";
import ReferralReview from "./pages/ReferralReview";

function Router() { return <Switch><Route path="/" component={Home} /><Route path="/onboarding" component={Onboarding} /><Route path="/referral-request/:id" component={ReferralRequest} /><Route path="/referral-review/:id" component={ReferralReview} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>; }
export default function App() { return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>; }
