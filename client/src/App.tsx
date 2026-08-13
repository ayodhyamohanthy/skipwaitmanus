import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import VerifiedMemberStories from "./components/VerifiedMemberStories";
import WorkspaceDataGuard from "./components/WorkspaceDataGuard";
import { ThemeProvider } from "./contexts/ThemeContext";
import Community from "./pages/Community";
import Dashboard from "./pages/Dashboard";
import Home from "./pages/Home";
import JobListings from "./pages/JobListings";
import Messages from "./pages/Messages";
import NotFound from "./pages/NotFound";
import Notifications from "./pages/Notifications";
import Onboarding from "./pages/Onboarding";
import Profile from "./pages/Profile";
import ReferralRequest from "./pages/ReferralRequest";
import ReferralReview from "./pages/ReferralReview";

function HomeWithTestimonials() { return <><Home /><VerifiedMemberStories /></>; }
function Workspace({ children }: { children: React.ReactNode }) { return <WorkspaceDataGuard>{children}</WorkspaceDataGuard>; }
function DashboardScreen() { return <Workspace><Dashboard /></Workspace>; } function JobsScreen() { return <Workspace><JobListings /></Workspace>; } function CommunityScreen() { return <Workspace><Community /></Workspace>; } function ReferralRequestScreen() { return <Workspace><ReferralRequest /></Workspace>; } function ReferralReviewScreen() { return <Workspace><ReferralReview /></Workspace>; } function ProfileScreen() { return <Workspace><Profile /></Workspace>; } function MessagesScreen() { return <Workspace><Messages /></Workspace>; } function NotificationsScreen() { return <Workspace><Notifications /></Workspace>; }
function Router() { return <Switch><Route path="/" component={HomeWithTestimonials} /><Route path="/onboarding" component={Onboarding} /><Route path="/dashboard" component={DashboardScreen} /><Route path="/jobs" component={JobsScreen} /><Route path="/community" component={CommunityScreen} /><Route path="/referral-request/:id" component={ReferralRequestScreen} /><Route path="/referral-review/:id" component={ReferralReviewScreen} /><Route path="/profile" component={ProfileScreen} /><Route path="/messages" component={MessagesScreen} /><Route path="/notifications" component={NotificationsScreen} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>; }
export default function App() { return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>; }

