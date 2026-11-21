export const PROVIDERS = ["chatgpt", "claude", "gemini"] as const;
export type Provider = (typeof PROVIDERS)[number];
export type KeyName = Provider | "deepinfra";

export const PROVIDER_LABEL: Record<Provider, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
};

export interface Settings {
  fixedQuestions: string[];
  autoQuestionCount: number;
  models: Record<KeyName, string>;
  /** Let each LLM search the web, as the consumer apps usually do. */
  webSearch: boolean;
  /** Replace [brand] with "Name (domain.com)" so ambiguous names resolve to the right company. */
  includeDomain: boolean;
  /** Optional per-browser key overrides. Empty string = use the server's env var. */
  keys: Record<KeyName, string>;
  appPassword: string;
}

export interface ScrapedPage {
  url: string;
  ok: boolean;
  title?: string;
  text?: string;
  chars?: number;
  truncated?: boolean;
  warning?: string;
  error?: string;
}

export interface Citation {
  title?: string;
  url: string;
}

export interface Answer {
  ok: boolean;
  text?: string;
  model?: string;
  citations?: Citation[];
  error?: string;
}

export interface Question {
  id: string;
  kind: "fixed" | "generated";
  text: string;
  /** Why the generator chose this question (generated only). */
  rationale?: string;
  answers: Partial<Record<Provider, Answer>>;
}

/** A statement the brand makes about itself, with where it came from. */
export interface SourcedClaim {
  claim: string;
  source: string;
}

export interface BrandSelf {
  brandName: string;
  category: string;
  oneLiner: string;
  summary: string;
  targetUsers: SourcedClaim[];
  notFor: SourcedClaim[];
  useCases: SourcedClaim[];
  features: SourcedClaim[];
  differentiators: SourcedClaim[];
  competitorsMentioned: string[];
  notStated: string[];
}

export interface LlmView {
  summary: string;
  category: string;
  recognition: "strong" | "partial" | "weak" | "none";
  recognitionNote: string;
  targetUsers: string[];
  notFor: string[];
  useCases: string[];
  features: string[];
  advantages: string[];
  competitors: string[];
}

export interface LlmDiff {
  consensus: string[];
  differences: {
    topic: string;
    chatgpt: string;
    claude: string;
    gemini: string;
    note: string;
  }[];
}

export type GapType =
  | "contradiction"
  | "omission"
  | "unsupported"
  | "emphasis"
  | "audience";

export interface Gap {
  topic: string;
  type: GapType;
  severity: "high" | "medium" | "low";
  brandSays: string;
  brandSource: string;
  llmSays: Partial<Record<Provider, string>>;
  affected: Provider[];
  whyItMatters: string;
  suggestedFix: string;
}

export interface GapReport {
  headline: string;
  perLlm: Partial<
    Record<Provider, { rating: "aligned" | "partly aligned" | "misaligned"; note: string }>
  >;
  gaps: Gap[];
  aligned: string[];
}

export interface Report {
  id: string;
  createdAt: string;
  urls: string[];
  positioningDoc: string;
  brandName: string;
  domain: string;
  settings: Pick<Settings, "models" | "webSearch" | "includeDomain">;
  pages: ScrapedPage[];
  self?: BrandSelf;
  questions: Question[];
  views: Partial<Record<Provider, LlmView>>;
  diff?: LlmDiff;
  gapReport?: GapReport;
  /** Non-fatal problems the reader should know about. */
  notes: string[];
}
