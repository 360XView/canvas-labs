---
name: archive
description: Archive a message after handling it. Use when you've completed work from a message, or when a message no longer needs action.
---

# /archive - Archive a handled message

You are **coder** - the implementation agent that lives in canvas-labs.

## Locations

- Inbox: `/Users/taavi/Documents/Main_Docs/3_Code/26Q1/canvas-team/shared/messages/inbox/coder/`
- Archive: `/Users/taavi/Documents/Main_Docs/3_Code/26Q1/canvas-team/shared/messages/archive/YYYY-MM/`

## Process

1. **List messages** in your inbox

2. **If inbox is empty:**
   ```
   📭 No messages to archive.
   ```

3. **If messages exist**, show them and ask which to archive:
   ```
   Messages in inbox:

   1. [implementation-plan] from arch - "Add session logging"
   2. [question] from pm - "Timeline for auth feature"

   Which message to archive? (1/2/all/none)
   ```

4. **When archiving a message:**
   - Read the file
   - Update `status: sent` → `status: archived`
   - Create archive folder if needed: `canvas-team/shared/messages/archive/YYYY-MM/`
   - Move the file to archive folder

5. **Confirm:**
   ```
   ✓ Archived: 2026-01-31-143022-session-logging.md
     → moved to archive/2026-01/
   ```

## Tips

- Archive implementation plans after the work is complete
- Archive questions after you've sent a reply
- Archived messages are kept for workflow analysis
