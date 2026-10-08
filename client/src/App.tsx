import React, { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/_core/auth";
import { useEffect, useState } from "react";
import { Redirect, Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { captureClientError } from "./lib/sentry";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SmokeProvider } from "./contexts/SmokeContext";
import { markSecureSessionVerified, readReferralDraft } from "./lib/pwaContinuity";
import Home from "./pages/Home";
import { PwaUpdatePrompt, SlowConnectionNotice } from "./components/PwaStatus";
import { AppShell } from "./components/AppShell";
const Verify = lazy(() => import("./pages/Verify"));
const Ask = lazy(() => import("./pages/Ask"));
const Explore = lazy(() => import("./pages/Explore"));
const ExploreCompany = lazy(() => import("./pages/ExploreCompany"));
const Alerts = lazy(() => import("./pages/Alerts"));
const ProfileSetup = lazy(() => import("./pages/ProfileSetup"));
const Profile = lazy(() => import("./pages/Profile"));
const Work = lazy(() => import("./pages/Work"));
const PublicProfile = lazy(() => import("./pages/PublicProfile"));
const ReferrerHome = lazy(() => import("./pages/ReferrerHome"));
const Invite = lazy(() => import("./pages/Invite"));
const ReferrerSetup = lazy(() => import("./pages/ReferrerSetup"));
const Safety = lazy(() => import("./pages/Safety"));
const Help = lazy(() => import("./pages/Help"));
const Landed = lazy(() => import("./pages/Landed"));
const SignIn = lazy(() => import("./pages/SignIn"));
const Report = lazy(() => import("./pages/Report"));
const SuggestCompany = lazy(() => import("./pages/SuggestCompany"));
const ForCompanies = lazy(() => import("./pages/ForCompanies"));
const AdminReview = lazy(() => import("./pages/AdminReview"));
const AppStates = lazy(() => import("./pages/AppStates"));
const Emails = lazy(() => import("./pages/Emails"));
const Developers = lazy(() => import("./pages/Developers"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Referrer = lazy(() => import("./pages/Referrer"));
const ReferrerImpact = lazy(() => import("./pages/ReferrerImpact"));
const Premium = lazy(() => import("./pages/Premium"));
const Billing = lazy(() => import("./pages/Billing"));
const Messages = lazy(() => import("./pages/Messages"));
const Plans = lazy(() => import("./pages/Plans"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Offline = lazy(() => import("./pages/Offline"));
const OpportunityWall = lazy(() => import("./pages/OpportunityWall"));
const PostOpportunity = lazy(() => import("./pages/PostOpportunity"));
const AdminActivity = lazy(() => import("./pages/AdminActivity"));
const AdminOverview = lazy(() => import("./pages/AdminOverview"));
const Settings = lazy(() => import("./pages/Settings"));
const ShareHub = lazy(() => import("./pages/ShareHub"));
const TrustPrivacy = lazy(() => import("./pages/TrustPrivacy"));
const Terms = lazy(() => import("./pages/Terms"));
const RefundPolicy = lazy(() => import("./pages/RefundPolicy"));
const ShippingPolicy = lazy(() => import("./pages/ShippingPolicy"));
const CancellationPolicy = lazy(() => import("./pages/CancellationPolicy"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Support = lazy(() => import("./pages/Support"));
const Guidelines = lazy(() => import("./pages/Guidelines"));
// One component for all three guides: it reads its own path, so adding a guide
// is a new Route here and a new entry in @shared/publicRoutes.ts.
const GuidePage = lazy(() => import("./pages/GuidePage"));
const AdminPrivacyRequests = lazy(() => import("./pages/AdminPrivacyRequests"));
const FastTrackLink = lazy(() => import("./pages/FastTrackLink"));
const VanityFastTrackLink = lazy(() => import("./pages/VanityFastTrackLink"));
const ShareCard = lazy(() => import("./pages/ShareCard"));
const EmailReviewAction = lazy(() => import("./pages/EmailReviewAction"));
const MyRequests = lazy(() => import("./pages/MyRequests"));
const MyCompanyInbox = lazy(() => import("./pages/MyCompanyInbox"));
const ReferralConversation = lazy(() => import("./pages/ReferralConversation"));
const UnifiedInbox = lazy(() => import("./pages/UnifiedInbox"));
const AdminFlowHealth = lazy(() => import("./pages/AdminFlowHealth"));
const AdminTokenRecovery = lazy(() => import("./pages/AdminTokenRecovery"));
const AdminPaymentsReview = lazy(() => import("./pages/AdminPaymentsReview"));
const AdminApprovalQueue = lazy(() => import("./pages/AdminApprovalQueue"));
const AdminApprovalRecord = lazy(() => import("./pages/AdminApprovalRecord"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const EmployerDashboard = lazy(() => import("./pages/EmployerDashboard"));
const TalentDiscovery = lazy(() => import("./pages/TalentDiscovery"));
const EmployerBilling = lazy(() => import("./pages/EmployerBilling"));
const EmployerOpportunities = lazy(() => import("./pages/EmployerOpportunities"));
const AdminPartners = lazy(() => import("./pages/AdminPartners"));
const AdminSchema = lazy(() => import("./pages/AdminSchema"));
const JobExplorer = lazy(() => import("./pages/JobExplorer"));
const ComponentShowcase = lazy(() => import("./pages/ComponentShowcase"));
const AdminSmoke = lazy(() => import("./pages/AdminSmoke"));
const Assistants = lazy(() => import("./pages/Assistants"));
const Approve = lazy(() => import("./pages/Approve"));
const ConnectAssistant = lazy(() => import("./pages/ConnectAssistant"));
const DeveloperConsole = lazy(() => import("./pages/DeveloperConsole"));
function RouteLoading(){return <main data-skipwait-screen="route-loading" className="h-dvh min-h-dvh overflow-hidden bg-white px-5 py-4 text-black"><div className="mx-auto flex h-full max-w-xl flex-col justify-center"><div className="animate-pulse rounded-2xl border border-[#e5e5e5] bg-white p-6 shadow-sm"><div className="h-3 w-24 rounded bg-[#f0f0f0]"/><div className="mt-5 h-9 w-3/4 rounded bg-[#f0f0f0]"/><div className="mt-3 h-4 w-full rounded bg-[#f0f0f0]"/><div className="mt-2 h-4 w-5/6 rounded bg-[#f0f0f0]"/><div className="mt-7 h-12 w-full rounded-lg bg-[#f0f0f0]"/></div></div></main>}
class RouteErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { captureClientError(error, { boundary: "RouteErrorBoundary", route: window.location.pathname }); }
  render() {
    if (this.state.error) {
      return <main data-skipwait-screen="route-error" className="h-dvh min-h-dvh overflow-hidden bg-white px-5 py-4 text-black"><div className="mx-auto flex h-full max-w-xl flex-col justify-center"><div className="rounded-2xl border border-[#e5e5e5] bg-white p-6 shadow-sm"><p className="text-xs font-bold uppercase tracking-[.16em] text-black">Something broke on this page</p><h1 className="mt-2 text-2xl font-semibold tracking-[-.03em]">This screen hit an error.</h1><p className="mt-3 text-sm leading-6 text-[#505050]">{this.state.error.message}</p><button type="button" onClick={() => { this.setState({ error: null }); window.location.href = "/"; }} className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-[#141414] px-5 py-3 text-sm font-semibold text-white">Back to home</button></div></div></main>;
    }
    return this.props.children;
  }
}

function Router(){return <RouteErrorBoundary><Suspense fallback={<RouteLoading/>}><Switch><Route path="/" component={Home}/><Route path="/fast/:linkCode" component={FastTrackLink}/><Route path="/refer/:companySlug/:vanityAlias" component={VanityFastTrackLink}/><Route path="/share-card/:token" component={ShareCard}/><Route path="/email-review/:linkToken" component={EmailReviewAction}/><Route path="/start" component={Onboarding}/><Route path="/request"><Redirect to="/ask" /></Route><Route path="/requests"><AppShell><MyRequests /></AppShell></Route><Route path="/verify"><AppShell><Verify /></AppShell></Route><Route path="/ask"><AppShell><Ask /></AppShell></Route><Route path="/explore"><AppShell><Explore /></AppShell></Route><Route path="/explore/:slug"><AppShell><ExploreCompany /></AppShell></Route><Route path="/alerts"><AppShell><Alerts /></AppShell></Route><Route path="/notifications"><Redirect to="/alerts" /></Route><Route path="/onboarding"><AppShell><ProfileSetup /></AppShell></Route><Route path="/profile"><AppShell><Profile /></AppShell></Route><Route path="/work"><AppShell><Work /></AppShell></Route><Route path="/p/:handle" component={PublicProfile} /><Route path="/referrer-home"><AppShell><ReferrerHome /></AppShell></Route><Route path="/invite"><AppShell><Invite /></AppShell></Route><Route path="/referrer-setup"><AppShell><ReferrerSetup /></AppShell></Route><Route path="/safety"><AppShell><Safety /></AppShell></Route><Route path="/help"><AppShell><Help /></AppShell></Route><Route path="/landed"><AppShell><Landed /></AppShell></Route><Route path="/sign-in" component={SignIn} /><Route path="/report"><AppShell><Report /></AppShell></Route><Route path="/suggest-company"><AppShell><SuggestCompany /></AppShell></Route><Route path="/for-companies" component={ForCompanies} /><Route path="/admin-review" component={AdminReview} /><Route path="/app-states" component={AppStates} /><Route path="/emails" component={Emails} /><Route path="/developers" component={Developers} /><Route path="/assistants"><AppShell><Assistants /></AppShell></Route><Route path="/approve"><AppShell><Approve /></AppShell></Route><Route path="/connect-assistant" component={ConnectAssistant} /><Route path="/developer-console" component={DeveloperConsole} /><Route path="/conversation/:requestId"><AppShell><ReferralConversation /></AppShell></Route><Route path="/messages" component={Messages}/><Route path="/share" component={ShareHub}/><Route path="/inbox"><AppShell><UnifiedInbox /></AppShell></Route><Route path="/queue" component={MyCompanyInbox}/><Route path="/settings"><AppShell><Settings /></AppShell></Route><Route path="/referrer" component={Referrer}/><Route path="/referrer/impact" component={ReferrerImpact}/><Route path="/premium" component={Premium}/><Route path="/plans"><AppShell><Plans /></AppShell></Route><Route path="/billing"><AppShell><Billing /></AppShell></Route><Route path="/privacy" component={TrustPrivacy}/><Route path="/terms" component={Terms}/><Route path="/refunds" component={RefundPolicy}/><Route path="/shipping" component={ShippingPolicy}/><Route path="/cancellations" component={CancellationPolicy}/><Route path="/about" component={About}/><Route path="/contact" component={Contact}/><Route path="/pricing" component={Pricing}/><Route path="/support" component={Support}/><Route path="/guidelines" component={Guidelines}/><Route path="/job-referral-platforms" component={GuidePage}/><Route path="/choosing-a-job-referral-platform" component={GuidePage}/><Route path="/how-employees-refer-candidates" component={GuidePage}/><Route path="/offline" component={Offline}/><Route path="/wall" component={OpportunityWall}/><Route path="/jobs" component={JobExplorer}/><Route path="/employer" component={EmployerDashboard}/><Route path="/employer/talent" component={TalentDiscovery}/><Route path="/employer/billing" component={EmployerBilling}/><Route path="/employer/opportunities" component={EmployerOpportunities}/><Route path="/admin" component={AdminOverview}/><Route path="/admin/partners" component={AdminPartners}/><Route path="/post-opportunity" component={PostOpportunity}/><Route path="/admin/activity" component={AdminActivity}/><Route path="/admin/approvals" component={AdminApprovalQueue}/><Route path="/admin/approvals/:kind/:id" component={AdminApprovalRecord}/><Route path="/admin/payments" component={AdminPaymentsReview}/><Route path="/admin/privacy-requests" component={AdminPrivacyRequests}/><Route path="/admin/flow-health" component={AdminFlowHealth}/><Route path="/admin/token-recovery" component={AdminTokenRecovery}/><Route path="/admin/users" component={AdminUsers}/><Route path="/admin/schema" component={AdminSchema}/><Route path="/admin/smoke" component={AdminSmoke}/>{import.meta.env.DEV ? <Route path="/components" component={ComponentShowcase}/> : null}<Route component={NotFound}/></Switch></Suspense></RouteErrorBoundary>}
function PwaSessionContinuity(){const {isLoaded,isSignedIn}=useAuth();useEffect(()=>{if(isLoaded&&isSignedIn)markSecureSessionVerified()},[isLoaded,isSignedIn]);return null}
const personalInviteStorageKey="skipwait:personal-invite-code";
function PersonalInviteAttribution(){const {isLoaded,isSignedIn}=useAuth();useEffect(()=>{if(typeof window==="undefined")return;const inviteCode=new URLSearchParams(window.location.search).get("invite")?.trim()??"";if(/^r\d+-[a-f0-9]{8}$/i.test(inviteCode))sessionStorage.setItem(personalInviteStorageKey,inviteCode)},[]);useEffect(()=>{if(!isLoaded||!isSignedIn)return;const inviteCode=sessionStorage.getItem(personalInviteStorageKey);if(!inviteCode)return;void fetch("/api/personal-invites/claim",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({inviteCode})}).finally(()=>sessionStorage.removeItem(personalInviteStorageKey))},[isLoaded,isSignedIn]);return null}
function OfflineNotice(){const [online,setOnline]=useState(()=>typeof navigator==="undefined"||navigator.onLine);useEffect(()=>{const restore=()=>setOnline(true);const lose=()=>setOnline(false);window.addEventListener("online",restore);window.addEventListener("offline",lose);return()=>{window.removeEventListener("online",restore);window.removeEventListener("offline",lose)}},[]);if(online||(typeof window!=="undefined"&&window.location.pathname==="/offline"))return null;const hasDraft=Boolean(readReferralDraft());return <div role="status" aria-live="polite" className="fixed inset-x-0 top-0 z-50 bg-[#141414] px-4 py-2 text-center text-xs font-medium text-white">{hasDraft?"You’re offline. Your referral draft is saved on this device; reconnect before sending.":"You’re offline. Saved pages remain available; reconnect before sending a request."}</div>}
export default function App(){return <ErrorBoundary><ThemeProvider defaultTheme="light"><SmokeProvider><TooltipProvider><PwaSessionContinuity/><PersonalInviteAttribution/><OfflineNotice/><SlowConnectionNotice/><PwaUpdatePrompt/><Toaster position="top-center" offset={{ top: "72px" }} mobileOffset={{ top: "72px" }} /><Router/></TooltipProvider></SmokeProvider></ThemeProvider></ErrorBoundary>}
