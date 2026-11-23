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

## Who can do what

| | Runs audits | Reports | Settings and API keys |
| --- | --- | --- | --- |
| **Visitor** (not logged in) | Yes, on the admin's keys and models | Kept in their own browser | No access |
| **Team** (logged in) | Yes | Saved for the whole team, filed by client | No access |
| **Admin** | Yes | Same as team | Sets them for everyone |

- **Visitors** get their own homepage: an introduction, then a four-step form (website, name and email, llms.txt and up to three solution pages, up to six claims). Only the website is required. If the site has an `llms.txt`, it is read and used as part of the brand's own material.
- **Visitors** can optionally leave a name and email. What they submit (website, other URLs, brand name, positioning doc, claims, email) is recorded, and the admin sees it under Admin → Visitor audits, with a CSV download.
- **Team members** are added by the admin under Admin → Team, with a temporary password. Nobody can sign themselves up. A member can change their password from their account page; the admin can set a new one.
- **API keys** saved by the admin are stored in the database and read only by the server. They are never sent to any browser, the admin's included.

Reports can be downloaded as Markdown or printed to PDF.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill it in
npm run dev
```

### Supabase

1. In the Supabase project, open the SQL Editor and run the files in `supabase/migrations/`, oldest first.
2. Under Authentication → Sign In / Providers, turn off "Allow new users to sign up".
3. Under Authentication → Users, add the admin's user (email and password, auto-confirmed).
4. Set the environment variables below.

| Variable | Used for |
| --- | --- |
| `SUPABASE_URL` | The project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Lets the browser log in. Safe to expose. |
| `SUPABASE_SECRET_KEY` | Server-side access to the data. Keep secret. |
| `ADMIN_EMAIL` | The email of the admin's Supabase user |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `DEEPINFRA_API_KEY` | Optional fallbacks, used when the admin has not saved that key in Settings |

The older `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` names are accepted too. Without the Supabase variables the app still runs audits on the provider keys above, with default settings and no logins, team reports or lead capture.

Every table has row level security on with no policies, so the publishable key can read nothing; all access goes through the app's server routes, which check who is logged in.

## Deploying to Vercel

Import the repo in Vercel (framework preset: Next.js), add the environment variables above, and deploy. The audit runs as many short API calls driven from the browser, so no single function call runs long.

Visitors run audits on the admin's keys with no usage cap, so set spending limits on each provider's dashboard.

## Settings (admin only)

- **Fixed questions:** add, edit, remove, reset.
- **Follow-up questions:** how many to generate (0 to 12).
- **Models and API keys:** the model ID and key for each provider. "Test key and load models" checks the key and lists the IDs the account can use.
- **Web search:** on by default, which is closer to the consumer apps; off measures what each model learned in training.
- **Domain in questions:** asks about "Acme (acme.com)" so a shared name resolves to the right company.

## Notes

- Pages are fetched as plain HTML. A site rendered entirely with JavaScript yields little text; the report flags this, and the fix is to paste the copy into the positioning doc.
- The analyst model on DeepInfra is deliberately not one of the three vendors being audited.
