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

/** How closely an LLM's answer to one question matches the brand's own answer. */
export type Similarity = "high" | "medium" | "low" | "n/a";

export const SIMILARITY_LABEL: Record<Similarity, string> = {
  high: "High similarity",
  medium: "Medium similarity",
  low: "Low similarity",
  "n/a": "Can't compare",
};

export interface QuestionComparison {
  questionId: string;
  /** The brand's own answer to the question, from its material only. */
  brandSays: string;
  /** False when the brand's material does not answer the question. */
  brandStated: boolean;
  llms: Partial<Record<Provider, { similarity: Similarity; llmSays: string; note: string }>>;
}

/** An LLM's own answer to "is this claim true?". */
export type Verdict = "true" | "false" | "unsure";

export const VERDICT_LABEL: Record<Verdict, string> = { true: "True", false: "False", unsure: "Unsure" };

export interface ClaimResult {
  /** Absent when the LLM gave no usable answer; such results are left out of the score. */
  verdict?: Verdict;
  /** The LLM's explanation, or why there is no verdict. */
  reason: string;
  citations?: Citation[];
}

export interface ClaimCheck {
  id: string;
  claim: string;
  results: Partial<Record<Provider, ClaimResult>>;
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
  /** One entry per scored question, fixed and follow-up. */
  comparisons?: QuestionComparison[];
  gapReport?: GapReport;
  /** Optional claims check: each brand-supplied claim, put to each LLM as true or false. */
  claims?: ClaimCheck[];
  /** Non-fatal problems the reader should know about. */
  notes: string[];
}
