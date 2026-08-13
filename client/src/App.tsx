import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
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
import NotFound from "./pages/NotFound";
function Router(){return <Switch><Route path="/" component={Home}/><Route path="/start" component={Onboarding}/><Route path="/request" component={ReferralRequest}/><Route path="/referrer" component={Referrer}/><Route path="/premium" component={Premium}/><Route component={NotFound}/></Switch>}
function PwaSessionContinuity(){const { isAuthenticated, refresh }=useAuth();useEffect(()=>{if(typeof window==="undefined")return;const restore=()=>{void refresh()};restore();return registerSecureSessionRestoration(restore,window,document)},[refresh]);useEffect(()=>{if(isAuthenticated)markSecureSessionVerified()},[isAuthenticated]);return null}
function OfflineNotice(){const [online,setOnline]=useState(()=>typeof navigator==="undefined"||navigator.onLine);useEffect(()=>{const restore=()=>setOnline(true);const lose=()=>setOnline(false);window.addEventListener("online",restore);window.addEventListener("offline",lose);return()=>{window.removeEventListener("online",restore);window.removeEventListener("offline",lose)}},[]);if(online)return null;const hasDraft=Boolean(readReferralDraft());return <div role="status" aria-live="polite" className="fixed inset-x-0 top-0 z-50 bg-[#2B2823] px-4 py-2 text-center text-xs font-medium text-[#FFF7EC]">{hasDraft?"You’re offline. Your referral draft is saved on this device; reconnect before sending.":"You’re offline. Saved pages remain available; reconnect before sending a request."}</div>}
export default function App(){return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><PwaSessionContinuity/><OfflineNotice/><Toaster/><Router/></TooltipProvider></ThemeProvider></ErrorBoundary>}
