// Goal-UI migration flags (D-120). Build-time switches, OFF by default: a
// surface ships to production only after QA verifies it on the preview with
// the flag on (D-097). One flag per migrating surface.
export const GOAL_UI_LANDING = import.meta.env.VITE_GOAL_UI_LANDING === "true";
export const GOAL_UI_SIGNIN = import.meta.env.VITE_GOAL_UI_SIGNIN === "true";
export const GOAL_UI_LANDING_V9 = import.meta.env.VITE_GOAL_UI_LANDING_V9 === "true";
