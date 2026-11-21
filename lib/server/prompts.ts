import { PROVIDER_LABEL, PROVIDERS } from "../types";
import type { BrandSelf, LlmView, Provider, Question, ScrapedPage } from "../types";

const JSON_ONLY = "Reply with a single JSON object and nothing else. Use plain strings, no markdown inside values.";

function transcript(questions: Question[], providers: readonly Provider[]) {
  return questions
    .map((q, i) => {
      const answers = providers
        .map((p) => {
          const a = q.answers[p];
          const body = a?.ok ? a.text : `[no answer: ${a?.error ?? "not asked"}]`;
          return `<answer llm="${p}">\n${body}\n</answer>`;
        })
        .join("\n");
      return `<question n="${i + 1}">\n${q.text}\n${answers}\n</question>`;
    })
    .join("\n\n");
}

/** (c) How the brand describes itself — from the supplied material and nothing else. */
export function selfPrompt(pages: ScrapedPage[], positioningDoc: string, brandHint: string) {
  const system = `You extract how a SaaS brand describes ITSELF, for a positioning audit.

The only evidence you may use is the material inside <brand_material>. This is a hard rule, because the audit compares this self-description against what AI models believe, and any outside knowledge you add would contaminate the comparison:
- Do not use anything you know about this company, its product, its market or its competitors from training or general knowledge, even if you recognise the brand and are confident.
- Every claim must be traceable to a specific passage. If the material does not say something, leave the list empty and name the topic in "notStated". Never infer, round out, or fill gaps.
- Keep the brand's own wording and emphasis. Do not improve, correct or editorialise.
- "source" is the page URL the claim came from, or "Positioning doc".
- When the positioning doc and a page disagree, report the positioning doc's version and mention the conflict in "notStated".

${JSON_ONLY}
Schema:
{
  "brandName": string,            // the product/brand name as the material writes it
  "category": string,             // the category the brand places itself in, in its words
  "oneLiner": string,             // one sentence: what it is and who it is for
  "summary": string,              // 3-5 sentences on how the brand positions itself
  "targetUsers": [{"claim": string, "source": string}],
  "notFor": [{"claim": string, "source": string}],          // who it says it is not for, if stated
  "useCases": [{"claim": string, "source": string}],
  "features": [{"claim": string, "source": string}],
  "differentiators": [{"claim": string, "source": string}], // stated advantages over alternatives
  "competitorsMentioned": [string],                         // only competitors named in the material
  "notStated": [string]                                     // topics the material is silent or contradictory on
}`;

  const material = [
    positioningDoc.trim() && `<source name="Positioning doc">\n${positioningDoc.trim()}\n</source>`,
    ...pages.filter((p) => p.ok && p.text).map((p) => `<source name="${p.url}">\n${p.text}\n</source>`),
  ]
    .filter(Boolean)
    .join("\n\n");

  const user = `${brandHint ? `The user says the brand name is: ${brandHint}\n\n` : ""}<brand_material>\n${material}\n</brand_material>`;
  return { system, user };
}

/** Follow-up questions derived from what the LLMs said in round one. */
export function questionsPrompt(brand: string, placeholder: string, fixed: Question[], count: number) {
  const system = `You design follow-up questions for an audit of how AI assistants describe a SaaS brand.

You are given the first-round questions and what ChatGPT, Claude and Gemini each answered. Write ${count} further questions that a real buyer or evaluator would plausibly type, chosen to expose what these models believe about the brand where the first round left it unclear. Good targets, in rough priority:
- points where the models disagreed with each other, or where one was vague, hedged, or seemed to describe a different company
- specific claims that deserve probing (pricing and plans, integrations, target company size, limits, security or compliance, onboarding effort)
- head-to-head comparisons with competitors the models themselves named
- the buying decision: who should pick it, who should pick an alternative, and why

Rules:
- Base the questions only on the answers provided. You have not seen the brand's own material and must not guess at it.
- Each question must stand alone, read like something a person would ask, and refer to the brand as ${placeholder} exactly (it is substituted later).
- No duplicates of the first-round questions and no near-duplicates of each other. One question, one topic.

${JSON_ONLY}
Schema: {"questions": [{"question": string, "rationale": string}]}   // rationale: one short sentence on what in the answers prompted it`;

  const user = `Brand: ${brand}\n\n<first_round>\n${transcript(fixed, PROVIDERS)}\n</first_round>`;
  return { system, user };
}

/** (a) How one LLM sees the brand. */
export function viewPrompt(brand: string, provider: Provider, questions: Question[]) {
  const system = `You summarise how one AI assistant (${PROVIDER_LABEL[provider]}) describes a SaaS brand, from a transcript of its answers.

Report only what this assistant said. Do not add facts of your own, do not correct it, and do not smooth over mistakes, hedging or confusion: those are findings. If it seemed unsure, declined, or appears to be describing a different company with a similar name, say so plainly.

"recognition" rates how well it appears to know the brand:
- "strong": specific, confident, consistent detail
- "partial": right general idea, thin or generic detail
- "weak": mostly guesses, heavy hedging, or generic category boilerplate
- "none": says it doesn't know the brand, or describes something else

${JSON_ONLY}
Schema:
{
  "summary": string,          // 3-5 sentences: the picture a reader would come away with
  "category": string,         // the category it places the brand in
  "recognition": "strong" | "partial" | "weak" | "none",
  "recognitionNote": string,  // one sentence justifying the rating
  "targetUsers": [string],
  "notFor": [string],
  "useCases": [string],
  "features": [string],
  "advantages": [string],
  "competitors": [string]     // competitors it named
}`;
  const user = `Brand: ${brand}\n\n<transcript>\n${transcript(questions, [provider])}\n</transcript>`;
  return { system, user };
}

/** (b) Where the LLMs differ from each other. */
export function diffPrompt(brand: string, questions: Question[], providers: Provider[]) {
  const system = `You compare how different AI assistants describe the same SaaS brand, from a transcript of their answers to identical questions.

Find the differences that would change what a buyer believes: category, audience, use cases, features, pricing, strengths, weaknesses, competitors, and how confident or informed each assistant sounds. Ignore differences of wording, length or formatting. Report only what the assistants said; add no facts of your own and do not judge who is right.

${JSON_ONLY}
Schema:
{
  "consensus": [string],      // substantive points all assistants agree on
  "differences": [{
    "topic": string,
    "chatgpt": string,        // its position on this topic, or "Did not address" / "Not asked"
    "claude": string,
    "gemini": string,
    "note": string            // one sentence: what the disagreement is and why it matters
  }]
}
List differences most consequential first.`;
  const missing = PROVIDERS.filter((p) => !providers.includes(p));
  const user = `Brand: ${brand}\n${missing.length ? `Not available in this run (use "Not asked"): ${missing.join(", ")}\n` : ""}\n<transcript>\n${transcript(questions, providers)}\n</transcript>`;
  return { system, user };
}

/** (d) Brand's self-description versus what the LLMs believe. */
export function gapPrompt(
  self: BrandSelf,
  positioningDoc: string,
  views: Partial<Record<Provider, LlmView>>,
  questions: Question[],
  providers: Provider[],
) {
  const system = `You audit the gap between how a SaaS brand describes itself and how AI assistants describe it. This is the core deliverable of the audit; the reader is the brand's marketing team and will act on it.

You are given:
- <brand_self>: the brand's self-description, extracted only from its own pages and positioning doc, plus the positioning doc itself. This is the sole reference for what the brand claims.
- <llm_views> and <transcript>: what each assistant said.

Rules:
- Compare the two sides only. Do not bring in your own knowledge of the brand or market to decide what is true. You are measuring divergence from the brand's stated positioning, not accuracy against the world.
- Be concrete. Quote or closely paraphrase both sides so the reader can see the gap without opening the transcript.
- Prefer few, real, distinct gaps over many thin ones. Merge duplicates. Skip trivia and wording differences.
- An assistant not knowing the brand, or confusing it with another company, is itself a high-severity gap.

Gap types:
- "contradiction": an assistant states something that conflicts with what the brand says
- "omission": something central to the brand's positioning that an assistant leaves out
- "unsupported": an assistant asserts something the brand's material never says (may be outdated, invented, or simply unstated; you cannot tell which, so do not guess)
- "emphasis": same facts, but the assistant leads with or frames the brand around something the brand does not lead with
- "audience": the assistant gets the intended (or excluded) user wrong

Severity reflects how much the gap would mislead a buyer deciding whether the product is for them: "high" changes the decision, "medium" distorts the picture, "low" is worth knowing.

${JSON_ONLY}
Schema:
{
  "headline": string,   // 2-3 sentences: the overall state of the brand's positioning in these assistants
  "perLlm": {           // one entry per assistant present
    "chatgpt": {"rating": "aligned" | "partly aligned" | "misaligned", "note": string},
    "claude":  {...},
    "gemini":  {...}
  },
  "gaps": [{
    "topic": string,                // short label
    "type": "contradiction" | "omission" | "unsupported" | "emphasis" | "audience",
    "severity": "high" | "medium" | "low",
    "brandSays": string,            // the brand's position, or "Not stated in the brand's material"
    "brandSource": string,          // URL or "Positioning doc"; "" if not stated
    "llmSays": {"chatgpt": string, "claude": string, "gemini": string},  // each affected assistant's position; omit assistants that match the brand
    "affected": ["chatgpt" | "claude" | "gemini"],
    "whyItMatters": string,         // one sentence
    "suggestedFix": string          // one sentence: what the brand could publish or clarify so assistants pick it up
  }],
  "aligned": [string]   // points where the assistants do match the brand's positioning
}
Order gaps by severity, high first.`;

  const user = `Assistants in this run: ${providers.join(", ")}

<brand_self>
${JSON.stringify(self, null, 1)}

<positioning_doc>
${positioningDoc.trim() || "(none provided)"}
</positioning_doc>
</brand_self>

<llm_views>
${JSON.stringify(views, null, 1)}
</llm_views>

<transcript>
${transcript(questions, providers)}
</transcript>`;
  return { system, user };
}
