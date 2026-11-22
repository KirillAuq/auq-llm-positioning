# LLM Positioning Audit

Finds the gap between how a SaaS brand describes itself and how ChatGPT, Claude and Gemini describe it.

## What it does

1. **Inputs:** one required brand URL, up to four more (service pages), and a positioning doc (Markdown).
2. **Reads the brand's material** and extracts how the brand describes itself, using only those URLs and the doc.
3. **Asks each LLM the fixed questions** (editable in Settings; `[brand]` is replaced with the brand name).
4. **Generates follow-up questions** from what the LLMs answered, and asks those too.
5. **Checks claims (optional):** on the intake's Claims check tab, list specific claims the brand makes about itself. Each one is put to every LLM as a direct true/false question, and the report gives a score: the share of answers that came back True.
6. **Builds the report:**
   - Question by question: what the brand says for each question (fixed and follow-up), and how similar each LLM's answer is (high, medium, low)
   - Brand vs LLMs: every gap, with both sides quoted, severity, and a suggested fix
   - How each LLM sees the brand
   - How the brand describes itself, with a source for every claim
   - All questions and raw answers

Reports are kept in the browser (localStorage) and can be downloaded as Markdown or printed to PDF.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in the keys
npm run dev
```

| Variable | Used for |
| --- | --- |
| `OPENAI_API_KEY` | ChatGPT answers |
| `ANTHROPIC_API_KEY` | Claude answers |
| `GEMINI_API_KEY` | Gemini answers |
| `DEEPINFRA_API_KEY` | Follow-up questions and all report analysis (required) |
| `APP_PASSWORD` | Optional. When set, the API routes require it. Set this on any public deployment. |

Keys can also be entered per browser on the Settings page, which overrides the server's. An LLM with no key is skipped and the report says so.

## Deploying to Vercel

Import the repo in Vercel (framework preset: Next.js), add the environment variables above, and deploy. The audit runs as many short API calls driven from the browser, so no single function call runs long.

## Settings

- **Fixed questions:** add, edit, remove, reset.
- **Follow-up questions:** how many to generate (0 to 12).
- **Models:** the model ID for each provider. "Test key and load models" checks the key and lists the IDs the account can use.
- **Web search:** on by default, which is closer to the consumer apps; off measures what each model learned in training.
- **Domain in questions:** asks about "Acme (acme.com)" so a shared name resolves to the right company.

## Notes

- Pages are fetched as plain HTML. A site rendered entirely with JavaScript yields little text; the report flags this, and the fix is to paste the copy into the positioning doc.
- The analyst model on DeepInfra is deliberately not one of the three vendors being audited.
