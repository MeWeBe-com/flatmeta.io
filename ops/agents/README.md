# FlatMeta agents (GL8)

Five prompt files, one per agent. Each file can be pasted on its own into:
- **Antigravity Cloud Automations**, as the automation's instruction, or
- **claude.ai scheduled tasks**, as the task prompt.

Each file has a role, a schedule, daily inputs, tools, outputs and guardrails.

| Agent | File | Runs | Writes |
|---|---|---|---|
| CEO | `ceo.md` | Mondays 07:30 UK, after the weekly report workflow | Fills in the verdict, risks and priorities in `docs/golive/weekly/<date>.md` |
| Marketing | `marketing.md` | Daily 08:00 UK | Drafts today's posts from the 30-day calendar and the next submissions, in `docs/golive/drafts/<date>-marketing.md` |
| Sales | `sales.md` | Weekdays 09:00 UK | A shortlist of companies with reserved land to invite, and the email drafts, in `docs/golive/drafts/<date>-sales.md` |
| Developer | `developer.md` | Daily 06:30 UK, after Daily QA and SEO | A fix PR for the top failing check, or an issue when the fix is bigger than a small change |
| QA | `qa.md` | Daily 06:15 UK | A daily QA note in `docs/golive/drafts/<date>-qa.md` from the Daily QA and SEO runs, with an issue for each new failure |

The data the agents read comes from three places:
- the scheduled GitHub Actions: `daily-qa.yml`, `daily-seo.yml` and `weekly-ceo-report.yml`;
- the public site and API;
- this repository.

**Guardrails for every agent.** They are repeated in each file so that each prompt works alone.
1. **No spending money:** no ads, paid listings, domains, plans, upgrades or app-store fees. A step that costs money goes to the owner as a proposal.
2. **No posting as a person, and no posting anywhere public:** agents draft and humans publish. No email sending, no social posting and no form submissions on third-party sites.
3. **No secrets in output:** never print, log or commit keys, tokens, `.env` contents, customer emails or personal data. Reports hold aggregate numbers only.
4. **Real numbers only:** every number comes from a named source (the weekly report, a workflow run or the API). If a number isn't available, say "not available".
5. **Branches:** agents never push to `main`, never force-push and never merge. Code changes go in a pull request to `v2`, for a human to review.
6. **Stay in scope:** the FlatMeta repository and the public FlatMeta sites only.

Setup steps are in `docs/golive/MANUAL-STEPS.md`, "Agents (GL8)".
