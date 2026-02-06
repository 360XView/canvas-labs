---
name: inbox
description: Check your inbox for messages from other agents. Use when starting a session, when told to check inbox, or to see what work is waiting for you.
---

# /inbox - Check your messages

You are **coder** - the implementation agent that lives in canvas-labs.

## Inbox Location

Your inbox is at: `/Users/taavi/Documents/Main_Docs/3_Code/26Q1/canvas-team/shared/messages/inbox/coder/`

## Process

1. **List messages** in your inbox using `ls`

2. **If inbox is empty:**
   ```
   📭 No messages in your inbox.
   ```

3. **If messages exist**, read each file's frontmatter and display:
   ```
   📬 You have {N} message(s):

   1. [{type}] from {from} - "{topic}"
      {timestamp} • {filename}

   2. [{type}] from {from} - "{topic}"
      {timestamp} • {filename}
   ```

4. **Ask user** which message to read (or "none" to skip)

5. **Display the full message** when selected

6. **Offer actions:**
   - "Archive this message?" - runs /archive flow
   - "Reply?" - runs /send flow

## Tips

- Check inbox at the start of a session
- Implementation plans from arch are your primary work source
- Questions from pm may need clarification before coding
