export type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  seniority: string;
  workMode: string;
  compatibility: number;
  description: string;
  tags: string[];
  referrer: string;
  referrerInitials: string;
  accent: string;
};

export type Referrer = {
  id: string;
  name: string;
  initials: string;
  title: string;
  company: string;
  expertise: string[];
  location: string;
  capacity: number;
  accent: string;
};

export type DemoReferral = {
  id: string;
  job: string;
  company: string;
  referrer: string;
  seeker: string;
  status: "pending" | "approved" | "intro_made" | "interview" | "offer" | "declined";
  updated: string;
  accent: string;
};

export const jobs: Job[] = [
  { id: "northstar-pd", title: "Senior Product Designer", company: "Northstar", location: "San Francisco, CA", seniority: "Senior", workMode: "Hybrid", compatibility: 92, description: "Shape thoughtful tools that turn complex workflows into calm, confident decisions.", tags: ["Product Design", "0→1", "Figma"], referrer: "Mira Shah", referrerInitials: "MS", accent: "bg-violet-100 text-violet-700" },
  { id: "futura-eng", title: "Staff Software Engineer", company: "Futura", location: "Remote, US", seniority: "Staff", workMode: "Remote", compatibility: 86, description: "Lead high-leverage platform work within a product-minded engineering organization.", tags: ["TypeScript", "Systems", "Mentorship"], referrer: "Jon Bell", referrerInitials: "JB", accent: "bg-sky-100 text-sky-700" },
  { id: "studio-growth", title: "Growth Marketing Lead", company: "Studio Nine", location: "New York, NY", seniority: "Lead", workMode: "Hybrid", compatibility: 81, description: "Build the next chapter of a culture-forward brand with an experimental growth team.", tags: ["Lifecycle", "Brand", "Analytics"], referrer: "Owen Lee", referrerInitials: "OL", accent: "bg-rose-100 text-rose-700" },
  { id: "loft-research", title: "User Researcher", company: "Loft", location: "Austin, TX", seniority: "Mid-level", workMode: "Hybrid", compatibility: 76, description: "Turn customer signals into clear product choices at a design-led collaboration company.", tags: ["Research", "Strategy", "B2B"], referrer: "Nadia Singh", referrerInitials: "NS", accent: "bg-amber-100 text-amber-700" },
  { id: "vertex-data", title: "Data Product Manager", company: "Vertex", location: "Chicago, IL", seniority: "Senior", workMode: "Remote", compatibility: 74, description: "Guide data products that help teams understand their work and make better decisions.", tags: ["Data", "Roadmaps", "SQL"], referrer: "Daniel Kim", referrerInitials: "DK", accent: "bg-emerald-100 text-emerald-700" },
  { id: "futura-designops", title: "Design Operations Manager", company: "Futura", location: "Remote, US", seniority: "Senior", workMode: "Remote", compatibility: 71, description: "Create the systems that let a growing design organization do its best work.", tags: ["Operations", "Design Systems", "Scale"], referrer: "Ava Grant", referrerInitials: "AG", accent: "bg-indigo-100 text-indigo-700" },
];

export const referrers: Referrer[] = [
  { id: "mira-shah", name: "Mira Shah", initials: "MS", title: "Design Director", company: "Northstar", expertise: ["Product Design", "Design Leadership", "B2B SaaS"], location: "San Francisco, CA", capacity: 2, accent: "bg-violet-100 text-violet-700" },
  { id: "jon-bell", name: "Jon Bell", initials: "JB", title: "Engineering Manager", company: "Futura", expertise: ["Platform", "TypeScript", "Developer Experience"], location: "Remote, US", capacity: 1, accent: "bg-sky-100 text-sky-700" },
  { id: "owen-lee", name: "Owen Lee", initials: "OL", title: "Growth Strategy Lead", company: "Studio Nine", expertise: ["Lifecycle", "Brand", "Experimentation"], location: "New York, NY", capacity: 3, accent: "bg-rose-100 text-rose-700" },
  { id: "nadia-singh", name: "Nadia Singh", initials: "NS", title: "Principal Researcher", company: "Loft", expertise: ["User Research", "Qualitative", "Product Strategy"], location: "Austin, TX", capacity: 2, accent: "bg-amber-100 text-amber-700" },
];

export const seekerReferrals: DemoReferral[] = [
  { id: "rr-1", job: "Senior Product Designer", company: "Northstar", referrer: "Mira Shah", seeker: "You", status: "intro_made", updated: "Updated today", accent: "bg-violet-500" },
  { id: "rr-2", job: "Staff Software Engineer", company: "Futura", referrer: "Jon Bell", seeker: "You", status: "interview", updated: "Interview scheduled", accent: "bg-sky-500" },
  { id: "rr-3", job: "Growth Marketing Lead", company: "Studio Nine", referrer: "Owen Lee", seeker: "You", status: "pending", updated: "Sent yesterday", accent: "bg-rose-500" },
];

export const incomingReferrals: DemoReferral[] = [
  { id: "rr-4", job: "Senior Product Designer", company: "Northstar", referrer: "You", seeker: "Avery Morgan", status: "pending", updated: "Received 2h ago", accent: "bg-violet-500" },
  { id: "rr-5", job: "Product Designer", company: "Northstar", referrer: "You", seeker: "Camille Laurent", status: "pending", updated: "Received yesterday", accent: "bg-amber-500" },
  { id: "rr-6", job: "Senior Product Designer", company: "Northstar", referrer: "You", seeker: "Noah Okafor", status: "intro_made", updated: "Introduction sent", accent: "bg-emerald-500" },
];

export const messages = [
  { id: 1, person: "Mira Shah", initials: "MS", accent: "bg-violet-100 text-violet-700", preview: "I’ve shared the introduction with the team.", time: "10:42 AM", unread: 0 },
  { id: 2, person: "Jon Bell", initials: "JB", accent: "bg-sky-100 text-sky-700", preview: "Happy to answer any questions before your interview.", time: "Yesterday", unread: 1 },
  { id: 3, person: "Owen Lee", initials: "OL", accent: "bg-rose-100 text-rose-700", preview: "Thanks for the thoughtful context in your request.", time: "Mon", unread: 0 },
];

export const notifications = [
  { id: 1, title: "Your introduction is on its way", body: "Mira Shah introduced you to the Northstar hiring team.", time: "20 minutes ago", type: "Referral Request", unread: true },
  { id: 2, title: "New message from Jon Bell", body: "A response is waiting in your conversation about Futura.", time: "3 hours ago", type: "Message", unread: true },
  { id: 3, title: "Interview stage updated", body: "Your Futura Referral Request moved to Interview.", time: "Yesterday", type: "Status", unread: false },
  { id: 4, title: "A new match is ready", body: "A Senior Product Designer role at Northstar fits your profile.", time: "Monday", type: "Opportunity", unread: false },
];
