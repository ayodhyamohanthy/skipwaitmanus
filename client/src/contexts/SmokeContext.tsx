import{createContext,useContext}from"react";import{smokeState}from"./smokeRuntime";
const C=createContext(smokeState());
export function SmokeProvider({children}:{children:React.ReactNode}){const state=smokeState();return<C.Provider value={state}>{state.active&&<div data-testid="smoke-banner" className="fixed inset-x-0 top-0 z-[100] bg-[#0000ff] px-3 py-2 text-center text-xs font-black tracking-widest text-black">SMOKE TEST · SYNTHETIC DATA · {state.identity?.role?.toUpperCase()}</div>}{children}</C.Provider>}
export const useSmoke=()=>useContext(C);
