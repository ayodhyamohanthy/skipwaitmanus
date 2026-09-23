import React, { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/_core/auth";
import { useEffect, useState } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { captureClientError } from "./lib/sentry";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SmokeProvider } from "./contexts/SmokeContext";
import { markSecureSessionVerified, readReferralDraft } from "./lib/pwaContinuity";
import Home from "./pages/Home";
const Onboarding = lazy(() => import("./pages/Onboarding"));
const ReferralRequest = lazy(() => import("./pages/ReferralRequest"));
const Referrer = lazy(() => import("./pages/Referrer"));
const ReferrerImpact = lazy(() => import("./pages/ReferrerImpact"));
const Premium = lazy(() => import("./pages/Premium"));
const Messages = lazy(() => import("./pages/Messages"));
const Plans = lazy(() => import("./pages/Plans"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Offline = lazy(() => import("./pages/Offline"));
const OpportunityWall = lazy(() => import("./pages/OpportunityWall"));
const PostOpportunity = lazy(() => import("./pages/PostOpportunity"));
const AdminActivity = lazy(() => import("./pages/AdminActivity"));
const Settings = lazy(() => import("./pages/Settings"));
const ShareHub = lazy(() => import("./pages/ShareHub"));
const TrustPrivacy = lazy(() => import("./pages/TrustPrivacy"));
const Terms = lazy(() => import("./pages/Terms"));
const RefundPolicy = lazy(() => import("./pages/RefundPolicy"));
const ShippingPolicy = lazy(() => import("./pages/ShippingPolicy"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Support = lazy(() => import("./pages/Support"));
const AdminPrivacyRequests = lazy(() => import("./pages/AdminPrivacyRequests"));
const FastTrackLink = lazy(() => import("./pages/FastTrackLink"));
const VanityFastTrackLink = lazy(() => import("./pages/VanityFastTrackLink"));
const ShareCard = lazy(() => import("./pages/ShareCard"));
const EmailReviewAction = lazy(() => import("./pages/EmailReviewAction"));
const MyRequests = lazy(() => import("./pages/MyRequests"));
const MyCompanyInbox = lazy(() => import("./pages/MyCompanyInbox"));
const ReferralConversation = lazy(() => import("./pages/ReferralConversation"));
const Notifications = lazy(() => import("./pages/Notifications"));
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
function RouteLoading(){return <main data-skipwait-screen="route-loading" className="h-dvh min-h-dvh overflow-hidden bg-white px-5 py-4 text-black"><div className="mx-auto flex h-full max-w-xl flex-col justify-center"><div className="animate-pulse rounded-2xl border border-[#e5e5e5] bg-white p-6 shadow-sm"><div className="h-3 w-24 rounded bg-[#e0e0ff]"/><div className="mt-5 h-9 w-3/4 rounded bg-[#f0f0f0]"/><div className="mt-3 h-4 w-full rounded bg-[#f0f0f0]"/><div className="mt-2 h-4 w-5/6 rounded bg-[#f0f0f0]"/><div className="mt-7 h-12 w-full rounded-lg bg-[#e0e0ff]"/></div></div></main>}
class RouteErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { captureClientError(error, { boundary: "RouteErrorBoundary", route: window.location.pathname }); }
  render() {
    if (this.state.error) {
      return <main data-skipwait-screen="route-error" className="h-dvh min-h-dvh overflow-hidden bg-white px-5 py-4 text-black"><div className="mx-auto flex h-full max-w-xl flex-col justify-center"><div className="rounded-2xl border border-[#e5e5e5] bg-white p-6 shadow-sm"><p className="text-xs font-bold uppercase tracking-[.16em] text-black">Something broke on this page</p><h1 className="mt-2 text-2xl font-semibold tracking-[-.03em]">This screen hit an error.</h1><p className="mt-3 text-sm leading-6 text-[#505050]">{this.state.error.message}</p><button type="button" onClick={() => { this.setState({ error: null }); window.location.href = "/"; }} className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-[#0000ff] px-5 py-3 text-sm font-semibold text-white">Back to home</button></div></div></main>;
    }
    return this.props.children;
  }
}

function Router(){return <RouteErrorBoundary><Suspense fallback={<RouteLoading/>}><Switch><Route path="/" component={Home}/><Route path="/fast/:linkCode" component={FastTrackLink}/><Route path="/refer/:companySlug/:vanityAlias" component={VanityFastTrackLink}/><Route path="/share-card/:token" component={ShareCard}/><Route path="/email-review/:linkToken" component={EmailReviewAction}/><Route path="/start" component={Onboarding}/><Route path="/request" component={ReferralRequest}/><Route path="/requests" component={MyRequests}/><Route path="/conversation/:requestId" component={ReferralConversation}/><Route path="/notifications" component={Notifications}/><Route path="/messages" component={Messages}/><Route path="/share" component={ShareHub}/><Route path="/inbox" component={MyCompanyInbox}/><Route path="/referrer" component={Referrer}/><Route path="/referrer/impact" component={ReferrerImpact}/><Route path="/premium" component={Premium}/><Route path="/plans" component={Plans}/><Route path="/settings" component={Settings}/><Route path="/privacy" component={TrustPrivacy}/><Route path="/terms" component={Terms}/><Route path="/refunds" component={RefundPolicy}/><Route path="/shipping" component={ShippingPolicy}/><Route path="/about" component={About}/><Route path="/contact" component={Contact}/><Route path="/pricing" component={Pricing}/><Route path="/support" component={Support}/><Route path="/offline" component={Offline}/><Route path="/wall" component={OpportunityWall}/><Route path="/jobs" component={JobExplorer}/><Route path="/employer" component={EmployerDashboard}/><Route path="/employer/talent" component={TalentDiscovery}/><Route path="/employer/billing" component={EmployerBilling}/><Route path="/employer/opportunities" component={EmployerOpportunities}/><Route path="/admin/partners" component={AdminPartners}/><Route path="/post-opportunity" component={PostOpportunity}/><Route path="/admin/activity" component={AdminActivity}/><Route path="/admin/approvals" component={AdminApprovalQueue}/><Route path="/admin/approvals/:kind/:id" component={AdminApprovalRecord}/><Route path="/admin/payments" component={AdminPaymentsReview}/><Route path="/admin/privacy-requests" component={AdminPrivacyRequests}/><Route path="/admin/flow-health" component={AdminFlowHealth}/><Route path="/admin/token-recovery" component={AdminTokenRecovery}/><Route path="/admin/users" component={AdminUsers}/><Route path="/admin/schema" component={AdminSchema}/><Route path="/admin/smoke" component={AdminSmoke}/>{import.meta.env.DEV ? <Route path="/components" component={ComponentShowcase}/> : null}<Route component={NotFound}/></Switch></Suspense></RouteErrorBoundary>}
function PwaSessionContinuity(){const {isLoaded,isSignedIn}=useAuth();useEffect(()=>{if(isLoaded&&isSignedIn)markSecureSessionVerified()},[isLoaded,isSignedIn]);return null}
const personalInviteStorageKey="skipwait:personal-invite-code";
function PersonalInviteAttribution(){const {isLoaded,isSignedIn}=useAuth();useEffect(()=>{if(typeof window==="undefined")return;const inviteCode=new URLSearchParams(window.location.search).get("invite")?.trim()??"";if(/^r\d+-[a-f0-9]{8}$/i.test(inviteCode))sessionStorage.setItem(personalInviteStorageKey,inviteCode)},[]);useEffect(()=>{if(!isLoaded||!isSignedIn)return;const inviteCode=sessionStorage.getItem(personalInviteStorageKey);if(!inviteCode)return;void fetch("/api/personal-invites/claim",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({inviteCode})}).finally(()=>sessionStorage.removeItem(personalInviteStorageKey))},[isLoaded,isSignedIn]);return null}
function OfflineNotice(){const [online,setOnline]=useState(()=>typeof navigator==="undefined"||navigator.onLine);useEffect(()=>{const restore=()=>setOnline(true);const lose=()=>setOnline(false);window.addEventListener("online",restore);window.addEventListener("offline",lose);return()=>{window.removeEventListener("online",restore);window.removeEventListener("offline",lose)}},[]);if(online)return null;const hasDraft=Boolean(readReferralDraft());return <div role="status" aria-live="polite" className="fixed inset-x-0 top-0 z-50 bg-[#0000ff] px-4 py-2 text-center text-xs font-medium text-white">{hasDraft?"You’re offline. Your referral draft is saved on this device; reconnect before sending.":"You’re offline. Saved pages remain available; reconnect before sending a request."}</div>}
export default function App(){return <ErrorBoundary><ThemeProvider defaultTheme="light"><SmokeProvider><TooltipProvider><PwaSessionContinuity/><PersonalInviteAttribution/><OfflineNotice/><Toaster position="top-center" offset={{ top: "72px" }} mobileOffset={{ top: "72px" }} /><Router/></TooltipProvider></SmokeProvider></ThemeProvider></ErrorBoundary>}
