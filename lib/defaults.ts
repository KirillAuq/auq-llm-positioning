import type { Settings } from "./types";

export const DEFAULT_FIXED_QUESTIONS = [
  "What is [brand]?",
  "What are the main use cases of [brand]?",
  "What type of user is [brand] best for?",
  "What type of user is [brand] worst for?",
  "What are the main features of [brand]?",
  "What are the main advantages of [brand] over its competitors?",
];

export const DEFAULT_SETTINGS: Settings = {
  fixedQuestions: DEFAULT_FIXED_QUESTIONS,
  autoQuestionCount: 6,
  models: {
    chatgpt: "gpt-6.2-sol",
    claude: "claude-opus-5-5",
    gemini: "gemini-3.5-flash",
    // Analyst + question generator. Deliberately not one of the three vendors
    // being audited, so no model grades its own answers.
    deepinfra: "zai-org/GLM-5.2",
  },
  webSearch: false,
  includeDomain: true,
  keys: { chatgpt: "", claude: "", gemini: "", deepinfra: "" },
  appPassword: "",
};

export const ENV_VAR: Record<keyof Settings["keys"], string> = {
  chatgpt: "OPENAI_API_KEY",
  claude: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  deepinfra: "DEEPINFRA_API_KEY",
};

export const MAX_URLS = 5;
export const MAX_CLAIMS = 25;
export const MAX_CLAIM_CHARS = 400;
/** Per-page cap on extracted text. Anything cut is flagged in the report, never silent. */
export const MAX_PAGE_CHARS = 60_000;
