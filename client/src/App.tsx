import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth as useClerkAuth } from "@clerk/react";
import { useEffect, useState } from "react";
import { Route, Switch } from "wouter";
import { useAuth } from "./_core/hooks/useAuth";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { markSecureSessionVerified, readReferralDraft, registerSecureSessionRestoration } from "./lib/pwaContinuity";
import Home from "./pages/Home";
import Onboarding from "./pages/Onboarding";
import ReferralRequest from "./pages/ReferralRequest";
import Referrer from "./pages/Referrer";
import Premium from "./pages/Premium";
import Plans from "./pages/Plans";
import NotFound from "./pages/NotFound";
import OpportunityWall from "./pages/OpportunityWall";
import PostOpportunity from "./pages/PostOpportunity";
import AdminActivity from "./pages/AdminActivity";
import Settings from "./pages/Settings";
import MyRequests from "./pages/MyRequests";
import MyCompanyInbox from "./pages/MyCompanyInbox";
import ReferralConversation from "./pages/ReferralConversation";
import AdminFlowHealth from "./pages/AdminFlowHealth";
import AdminTokenRecovery from "./pages/AdminTokenRecovery";
import ShareHub from "./pages/ShareHub";
import TrustPrivacy from "./pages/TrustPrivacy";
import AdminPrivacyRequests from "./pages/AdminPrivacyRequests";
import Notifications from "./pages/Notifications";
import FastTrackLink from "./pages/FastTrackLink";
import VanityFastTrackLink from "./pages/VanityFastTrackLink";
import ShareCard from "./pages/ShareCard";
function Router(){return <Switch><Route path="/" component={Home}/><Route path="/fast/:linkCode" component={FastTrackLink}/><Route path="/refer/:companySlug/:vanityAlias" component={VanityFastTrackLink}/><Route path="/share-card/:token" component={ShareCard}/><Route path="/start" component={Onboarding}/><Route path="/request" component={ReferralRequest}/><Route path="/requests" component={MyRequests}/><Route path="/conversation/:requestId" component={ReferralConversation}/><Route path="/notifications" component={Notifications}/><Route path="/share" component={ShareHub}/><Route path="/inbox" component={MyCompanyInbox}/><Route path="/referrer" component={Referrer}/><Route path="/premium" component={Premium}/><Route path="/plans" component={Plans}/><Route path="/settings" component={Settings}/><Route path="/privacy" component={TrustPrivacy}/><Route path="/wall" component={OpportunityWall}/><Route path="/post-opportunity" component={PostOpportunity}/><Route path="/admin/activity" component={AdminActivity}/><Route path="/admin/privacy-requests" component={AdminPrivacyRequests}/><Route path="/admin/flow-health" component={AdminFlowHealth}/><Route path="/admin/token-recovery" component={AdminTokenRecovery}/><Route component={NotFound}/></Switch>}
function PwaSessionContinuity(){const { isAuthenticated, refresh }=useAuth();useEffect(()=>{if(typeof window==="undefined")return;const restore=()=>{void refresh()};restore();return registerSecureSessionRestoration(restore,window,document)},[refresh]);useEffect(()=>{if(isAuthenticated)markSecureSessionVerified()},[isAuthenticated]);return null}
const personalInviteStorageKey="skipwait:personal-invite-code";
function PersonalInviteAttribution(){const {isLoaded,isSignedIn}=useClerkAuth();useEffect(()=>{if(typeof window==="undefined")return;const inviteCode=new URLSearchParams(window.location.search).get("invite")?.trim()??"";if(/^r\d+-[a-f0-9]{8}$/i.test(inviteCode))sessionStorage.setItem(personalInviteStorageKey,inviteCode)},[]);useEffect(()=>{if(!isLoaded||!isSignedIn)return;const inviteCode=sessionStorage.getItem(personalInviteStorageKey);if(!inviteCode)return;void fetch("/api/personal-invites/claim",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({inviteCode})}).finally(()=>sessionStorage.removeItem(personalInviteStorageKey))},[isLoaded,isSignedIn]);return null}
function OfflineNotice(){const [online,setOnline]=useState(()=>typeof navigator==="undefined"||navigator.onLine);useEffect(()=>{const restore=()=>setOnline(true);const lose=()=>setOnline(false);window.addEventListener("online",restore);window.addEventListener("offline",lose);return()=>{window.removeEventListener("online",restore);window.removeEventListener("offline",lose)}},[]);if(online)return null;const hasDraft=Boolean(readReferralDraft());return <div role="status" aria-live="polite" className="fixed inset-x-0 top-0 z-50 bg-[#2B2823] px-4 py-2 text-center text-xs font-medium text-[#FFF7EC]">{hasDraft?"You’re offline. Your referral draft is saved on this device; reconnect before sending.":"You’re offline. Saved pages remain available; reconnect before sending a request."}</div>}
export default function App(){return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><PwaSessionContinuity/><PersonalInviteAttribution/><OfflineNotice/><Toaster/><Router/></TooltipProvider></ThemeProvider></ErrorBoundary>}
