/**
 * Chat personality system — 6 distinct AI personas.
 * Random by default, selectable in settings, persisted to localStorage.
 */

export type PersonalityId =
  | "focused"
  | "thinker"
  | "director"
  | "expert"
  | "collaborator"
  | "hacker";

export const PERSONALITY_LABELS: Record<
  PersonalityId,
  { name: string; tagline: string; preview: string }
> = {
  focused: {
    name: "Focused",
    tagline: "Terse and confident. Just builds.",
    preview: "Facilities management — got it. Building now.",
  },
  thinker: {
    name: "Thinker",
    tagline: "Shows reasoning. Thinks out loud.",
    preview:
      "Thinking about this as a helpdesk + asset system. Building that now...",
  },
  director: {
    name: "Director",
    tagline: "Opinionated and energetic.",
    preview: "Nice — going with a clean request-first layout. Starting now...",
  },
  expert: {
    name: "Expert",
    tagline: "Quiet authority. Industry-knowledgeable.",
    preview: "Building a facilities management system.",
  },
  collaborator: {
    name: "Collaborator",
    tagline: "Warm and conversational. Feels like a teammate.",
    preview:
      "A facilities system — great choice! Setting up the request queue now...",
  },
  hacker: {
    name: "Hacker",
    tagline: "Raw and technical. Shows the machine.",
    preview:
      "> Template: facilities-management\n> Enriching context...\n> Generating...",
  },
};

export const ALL_PERSONALITIES = Object.keys(
  PERSONALITY_LABELS,
) as PersonalityId[];

export function getRandomPersonality(): PersonalityId {
  return ALL_PERSONALITIES[
    Math.floor(Math.random() * ALL_PERSONALITIES.length)
  ];
}

export function getPersonality(): PersonalityId {
  const stored = localStorage.getItem("beomz-personality") as
    | PersonalityId
    | null;
  if (stored && ALL_PERSONALITIES.includes(stored)) return stored;
  const random = getRandomPersonality();
  localStorage.setItem("beomz-personality", random);
  return random;
}

export function setPersonality(id: PersonalityId) {
  localStorage.setItem("beomz-personality", id);
}

export function setRandomPersonality() {
  localStorage.removeItem("beomz-personality");
}

export function isRandomMode(): boolean {
  return localStorage.getItem("beomz-personality") === null;
}

// ── Personality configs ─────────────────────────────────────────

export interface PersonalityConfig {
  intro: (appName: string, domain: string) => string;
  thinkingLabels: string[];
  iterationIntro: (userMessage: string) => string;
  summary: (
    appName: string,
    fileCount: number,
    changedFiles?: string[],
  ) => string;
}

function summariseAction(msg: string): string {
  const clean = msg.trim().replace(/[.!?]+$/, "");
  if (clean.length <= 50) return clean;
  return clean.slice(0, 47).replace(/\s+\S*$/, "") + "...";
}

export const PERSONALITIES: Record<PersonalityId, PersonalityConfig> = {
  focused: {
    intro: (_appName, domain) => `${domain} — got it. Building now.`,
    thinkingLabels: [
      "\u2726 Researching domain...",
      "\u2726 Selecting architecture...",
      "\u2726 Writing components...",
      "\u2726 Connecting data layer...",
      "\u2726 Almost done...",
    ],
    iterationIntro: (msg) => `${summariseAction(msg)}...`,
    summary: (appName, fileCount, changed) =>
      changed?.length
        ? "Done. What else?"
        : `${appName} built — ${fileCount} files. What's next?`,
  },

  thinker: {
    intro: (_appName, domain) =>
      `Thinking about this as ${domain}. Building that now...`,
    thinkingLabels: [
      "\uD83D\uDCAD Researching domain patterns...",
      "\uD83D\uDCAD Choosing layout approach...",
      "\uD83D\uDCAD Structuring data model...",
      "\uD83D\uDCAD Writing components...",
      "\uD83D\uDCAD Finalising...",
    ],
    iterationIntro: (msg) =>
      `Let me ${summariseAction(msg).toLowerCase()} — updating now...`,
    summary: (appName, fileCount, changed) =>
      changed?.length
        ? `Done — ${changed.slice(0, 2).join(", ")}${changed.length > 2 ? ` + ${changed.length - 2} more` : ""}. What would you like to refine?`
        : `Here's your ${appName}. ${fileCount} files. What would you like to refine?`,
  },

  director: {
    intro: (_appName, domain) =>
      `Nice — building a clean ${domain}. Starting now...`,
    thinkingLabels: [
      "Researching best practices...",
      "Designing the layout...",
      "Building components...",
      "Finalising...",
    ],
    iterationIntro: (msg) => `On it — ${summariseAction(msg).toLowerCase()}`,
    summary: (appName, fileCount, changed) =>
      changed?.length
        ? `Done — ${changed.slice(0, 2).join(", ")} updated. Looking good!`
        : `${appName} is live.\n\n${fileCount} files generated. What would make this perfect?`,
  },

  expert: {
    intro: (_appName, domain) => `Building ${/^[aeiou]/i.test(domain) ? "an" : "a"} ${domain}.`,
    thinkingLabels: [
      "Analysing requirements...",
      "Structuring data model...",
      "Generating interface...",
      "Applying conventions...",
    ],
    iterationIntro: (msg) => `${summariseAction(msg)}. Updating now.`,
    summary: (appName, fileCount, changed) =>
      changed?.length
        ? `Updated — ${changed.slice(0, 3).join(", ")}.`
        : `Complete. ${appName} — ${fileCount} files.`,
  },

  collaborator: {
    intro: (_appName, domain) =>
      `${/^[aeiou]/i.test(domain) ? "An" : "A"} ${domain} — great choice! Setting things up for you now...`,
    thinkingLabels: [
      "Working on it with you...",
      "Setting up the main view...",
      "Adding supporting features...",
      "Almost there...",
    ],
    iterationIntro: (msg) => `On it! ${summariseAction(msg)}...`,
    summary: (appName, fileCount, changed) =>
      changed?.length
        ? `Done! Updated ${changed.slice(0, 2).join(" and ")}. How does that look?`
        : `Here you go! ${appName} is ready — ${fileCount} files. Let me know what you'd like to tweak.`,
  },

  hacker: {
    intro: (_appName, domain) =>
      `> Parsing: ${domain.toLowerCase().replace(/\s+/g, "_")}\n> Enriching context...\n> Generating...`,
    thinkingLabels: [
      "> Running domain analysis...",
      "> Scaffolding components...",
      "> Wiring data layer...",
      "> Compiling...",
    ],
    iterationIntro: (msg) =>
      `> Processing: "${msg.slice(0, 40)}"\n> Patching files...`,
    summary: (appName, fileCount, changed) =>
      changed?.length
        ? `> Patched: ${changed.slice(0, 3).join(", ")}\n> Done.`
        : `> Build complete: ${fileCount} files\n> ${appName} ready.`,
  },
};

// ── Common typo corrections (AI response only, not user bubble) ──

const TYPO_MAP: [RegExp, string][] = [
  [/\bfaceilities\b/gi, "facilities"],
  [/\bfacilties\b/gi, "facilities"],
  [/\bmanagment\b/gi, "management"],
  [/\bmanagemen\b/gi, "management"],
  [/\bsytem\b/gi, "system"],
  [/\bsytems\b/gi, "systems"],
  [/\bapplicaton\b/gi, "application"],
  [/\bapplicaiton\b/gi, "application"],
  [/\bdashbaord\b/gi, "dashboard"],
  [/\bdahsboard\b/gi, "dashboard"],
  [/\bscheduel\b/gi, "schedule"],
  [/\bschdule\b/gi, "schedule"],
  [/\bcalender\b/gi, "calendar"],
  [/\bcalendar\b/gi, "calendar"],
  [/\binventroy\b/gi, "inventory"],
  [/\binvetory\b/gi, "inventory"],
  [/\bemploye\b/gi, "employee"],
  [/\bemployess\b/gi, "employees"],
  [/\bregistartion\b/gi, "registration"],
  [/\bregstration\b/gi, "registration"],
  [/\bauthentication\b/gi, "authentication"],
  [/\bauthentiction\b/gi, "authentication"],
  [/\bnotifcation\b/gi, "notification"],
  [/\bnotificaton\b/gi, "notification"],
  [/\bconfiguartion\b/gi, "configuration"],
  [/\bconfigration\b/gi, "configuration"],
  [/\breccomend\b/gi, "recommend"],
  [/\brecommned\b/gi, "recommend"],
  [/\banaltics\b/gi, "analytics"],
  [/\banalyitcs\b/gi, "analytics"],
  [/\becommerce\b/gi, "e-commerce"],
  [/\bebook\b/gi, "e-book"],
];

export function correctTypos(text: string): string {
  let result = text;
  for (const [pattern, replacement] of TYPO_MAP) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
