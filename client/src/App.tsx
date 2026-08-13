import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Onboarding from "./pages/Onboarding";
import ReferralRequest from "./pages/ReferralRequest";
import Referrer from "./pages/Referrer";
import Premium from "./pages/Premium";
import NotFound from "./pages/NotFound";
function Router(){return <Switch><Route path="/" component={Home}/><Route path="/start" component={Onboarding}/><Route path="/request" component={ReferralRequest}/><Route path="/referrer" component={Referrer}/><Route path="/premium" component={Premium}/><Route component={NotFound}/></Switch>}
export default function App(){return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster/><Router/></TooltipProvider></ThemeProvider></ErrorBoundary>}
