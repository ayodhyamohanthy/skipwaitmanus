import React from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/_core/auth";
import { useEffect, useState } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { markSecureSessionVerified, readReferralDraft } from "./lib/pwaContinuity";
import Home from "./pages/Home";
import Onboarding from "./pages/Onboarding";
import ReferralRequest from "./pages/ReferralRequest";
import Referrer from "./pages/Referrer";
import ReferrerImpact from "./pages/ReferrerImpact";
import Premium from "./pages/Premium";
import Messages from "./pages/Messages";
import Plans from "./pages/Plans";
import NotFound from "./pages/NotFound";
import OpportunityWall from "./pages/OpportunityWall";
import PostOpportunity from "./pages/PostOpportunity";
import AdminActivity from "./pages/AdminActivity";
import Settings from "./pages/Settings";
import ShareHub from "./pages/ShareHub";
import TrustPrivacy from "./pages/TrustPrivacy";
import Terms from "./pages/Terms";
import RefundPolicy from "./pages/RefundPolicy";
import Support from "./pages/Support";
import AdminPrivacyRequests from "./pages/AdminPrivacyRequests";
import FastTrackLink from "./pages/FastTrackLink";
import VanityFastTrackLink from "./pages/VanityFastTrackLink";
import ShareCard from "./pages/ShareCard";
import EmailReviewAction from "./pages/EmailReviewAction";
import MyRequests from "./pages/MyRequests";
import MyCompanyInbox from "./pages/MyCompanyInbox";
import ReferralConversation from "./pages/ReferralConversation";
import Notifications from "./pages/Notifications";
import AdminFlowHealth from "./pages/AdminFlowHealth";
import AdminTokenRecovery from "./pages/AdminTokenRecovery";
import AdminPaymentsReview from "./pages/AdminPaymentsReview";
import AdminApprovalQueue from "./pages/AdminApprovalQueue";
import AdminApprovalRecord from "./pages/AdminApprovalRecord";
import AdminUsers from "./pages/AdminUsers";
import EmployerDashboard from "./pages/EmployerDashboard";
import TalentDiscovery from "./pages/TalentDiscovery";
import EmployerBilling from "./pages/EmployerBilling";
import EmployerOpportunities from "./pages/EmployerOpportunities";
import AdminPartners from "./pages/AdminPartners";
import AdminSchema from "./pages/AdminSchema";
import JobExplorer from "./pages/JobExplorer";
import ComponentShowcase from "./pages/ComponentShowcase";
import AdminSmoke from "./pages/AdminSmoke";
function RouteLoading(){return <main data-skipwait-screen="route-loading" className="h-dvh min-h-dvh overflow-hidden bg-slate-50 px-5 py-4 text-slate-950"><div className="mx-auto flex h-full max-w-xl flex-col justify-center"><div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="h-3 w-24 rounded bg-blue-100"/><div className="mt-5 h-9 w-3/4 rounded bg-slate-100"/><div className="mt-3 h-4 w-full rounded bg-slate-100"/><div className="mt-2 h-4 w-5/6 rounded bg-slate-100"/><div className="mt-7 h-12 w-full rounded-lg bg-blue-100"/></div></div></main>}
class RouteErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return <main data-skipwait-screen="route-error" className="h-dvh min-h-dvh overflow-hidden bg-slate-50 px-5 py-4 text-slate-950"><div className="mx-auto flex h-full max-w-xl flex-col justify-center"><div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Something broke on this page</p><h1 className="mt-2 text-2xl font-semibold tracking-[-.03em]">This screen hit an error.</h1><p className="mt-3 text-sm leading-6 text-slate-600">{this.state.error.message}</p><button type="button" onClick={() => { this.setState({ error: null }); window.location.href = "/"; }} className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-[#0B57D0] px-5 py-3 text-sm font-semibold text-white">Back to home</button></div></div></main>;
    }
    return this.props.children;
  }
}

function Router(){return <RouteErrorBoundary><Switch><Route path="/" component={Home}/><Route path="/fast/:linkCode" component={FastTrackLink}/><Route path="/refer/:companySlug/:vanityAlias" component={VanityFastTrackLink}/><Route path="/share-card/:token" component={ShareCard}/><Route path="/email-review/:linkToken" component={EmailReviewAction}/><Route path="/start" component={Onboarding}/><Route path="/request" component={ReferralRequest}/><Route path="/requests" component={MyRequests}/><Route path="/conversation/:requestId" component={ReferralConversation}/><Route path="/notifications" component={Notifications}/><Route path="/messages" component={Messages}/><Route path="/share" component={ShareHub}/><Route path="/inbox" component={MyCompanyInbox}/><Route path="/referrer" component={Referrer}/><Route path="/referrer/impact" component={ReferrerImpact}/><Route path="/premium" component={Premium}/><Route path="/plans" component={Plans}/><Route path="/settings" component={Settings}/><Route path="/privacy" component={TrustPrivacy}/><Route path="/terms" component={Terms}/><Route path="/refunds" component={RefundPolicy}/><Route path="/support" component={Support}/><Route path="/wall" component={OpportunityWall}/><Route path="/jobs" component={JobExplorer}/><Route path="/employer" component={EmployerDashboard}/><Route path="/employer/talent" component={TalentDiscovery}/><Route path="/employer/billing" component={EmployerBilling}/><Route path="/employer/opportunities" component={EmployerOpportunities}/><Route path="/admin/partners" component={AdminPartners}/><Route path="/post-opportunity" component={PostOpportunity}/><Route path="/admin/activity" component={AdminActivity}/><Route path="/admin/approvals" component={AdminApprovalQueue}/><Route path="/admin/approvals/:kind/:id" component={AdminApprovalRecord}/><Route path="/admin/payments" component={AdminPaymentsReview}/><Route path="/admin/privacy-requests" component={AdminPrivacyRequests}/><Route path="/admin/flow-health" component={AdminFlowHealth}/><Route path="/admin/token-recovery" component={AdminTokenRecovery}/><Route path="/admin/users" component={AdminUsers}/><Route path="/admin/schema" component={AdminSchema}/><Route path="/admin/smoke" component={AdminSmoke}/><Route path="/components" component={ComponentShowcase}/><Route component={NotFound}/></Switch></RouteErrorBoundary>}
function PwaSessionContinuity(){const {isLoaded,isSignedIn}=useAuth();useEffect(()=>{if(isLoaded&&isSignedIn)markSecureSessionVerified()},[isLoaded,isSignedIn]);return null}
const personalInviteStorageKey="skipwait:personal-invite-code";
function PersonalInviteAttribution(){const {isLoaded,isSignedIn}=useAuth();useEffect(()=>{if(typeof window==="undefined")return;const inviteCode=new URLSearchParams(window.location.search).get("invite")?.trim()??"";if(/^r\d+-[a-f0-9]{8}$/i.test(inviteCode))sessionStorage.setItem(personalInviteStorageKey,inviteCode)},[]);useEffect(()=>{if(!isLoaded||!isSignedIn)return;const inviteCode=sessionStorage.getItem(personalInviteStorageKey);if(!inviteCode)return;void fetch("/api/personal-invites/claim",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({inviteCode})}).finally(()=>sessionStorage.removeItem(personalInviteStorageKey))},[isLoaded,isSignedIn]);return null}
function OfflineNotice(){const [online,setOnline]=useState(()=>typeof navigator==="undefined"||navigator.onLine);useEffect(()=>{const restore=()=>setOnline(true);const lose=()=>setOnline(false);window.addEventListener("online",restore);window.addEventListener("offline",lose);return()=>{window.removeEventListener("online",restore);window.removeEventListener("offline",lose)}},[]);if(online)return null;const hasDraft=Boolean(readReferralDraft());return <div role="status" aria-live="polite" className="fixed inset-x-0 top-0 z-50 bg-[#2B2823] px-4 py-2 text-center text-xs font-medium text-[#FFF7EC]">{hasDraft?"You’re offline. Your referral draft is saved on this device; reconnect before sending.":"You’re offline. Saved pages remain available; reconnect before sending a request."}</div>}
export default function App(){return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><PwaSessionContinuity/><PersonalInviteAttribution/><OfflineNotice/><Toaster/><Router/></TooltipProvider></ThemeProvider></ErrorBoundary>}
