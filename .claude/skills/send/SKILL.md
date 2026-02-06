---
name: send
description: Send a message to another agent. Use when you need to ask a question, request a review, or report completion to another canvas-team agent.
---

# /send - Send a message to another agent

You are **coder** - the implementation agent that lives in canvas-labs.

## Message Location

Messages go to: `/Users/taavi/Documents/Main_Docs/3_Code/26Q1/canvas-team/shared/messages/inbox/{to}/`

## Available Recipients

- **arch** - Architecture agent (design questions, clarifications)
- **el** - EvalLead agent (evaluation questions)
- **pm** - Product manager (status updates, blockers)
- **wpm** - Work process manager (process questions)

## Process

1. **Ask the user** (use AskUserQuestion tool):
   - **To:** arch / el / pm / wpm
   - **Type:** question / review-request / completion / blocker

2. **Ask for topic** - Brief description (e.g., "Need clarification on auth flow")

3. **Generate metadata:**
   - `id`: Current timestamp as `YYYY-MM-DD-HHMMSS`
   - `timestamp`: Current time in ISO 8601 format
   - `status`: `sent`
   - `from`: `coder`

4. **Compose the message** with the user:
   - For `question`: What you need to know, what you've tried
   - For `review-request`: What was done, where to look
   - For `completion`: What was implemented, how to test
   - For `blocker`: What's blocking, what you need

5. **Create the file:**
   - Path: `canvas-team/shared/messages/inbox/{to}/{id}-{topic-slug}.md`
   - Include YAML frontmatter with all metadata

6. **Confirm:**
   ```
   ✓ Sent to {to}'s inbox: {filename}
   ```

## Message Template

```markdown
---
id: {YYYY-MM-DD-HHMMSS}
from: coder
to: {recipient}
timestamp: {ISO-8601}
type: {message-type}
topic: "{topic}"
status: sent
---

# {Title}

{Content}
```

## Tips

- Ask arch for design clarifications before implementing workarounds
- Send completion messages when finishing significant work
- Blockers should include what you've tried
