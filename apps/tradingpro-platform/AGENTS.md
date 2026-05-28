# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd prime` for full workflow context.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work atomically
bd close <id>         # Complete work
bd dolt push          # Push beads data to remote
```

---

## Admin Console Audit — Working on Issues

The admin console (`app/(admin)/admin-console/` and `components/admin-console/`) has **24 tracked issues** from a comprehensive enterprise audit. All issues are P2 priority.

### Critical Security Issues (Fix First)

| ID | Title | File |
|----|-------|------|
| `tradingpro-platform-8du` | XSS: Escape user-controlled strings | `financial-overview.tsx` |
| `tradingpro-platform-9hy` | XSS: Escape table cell values | `financial-reports.tsx` |
| `tradingpro-platform-j9l` | XSS: Sanitize userAgent display | `audit-trail.tsx` |
| `tradingpro-platform-pwg` | MOB: Replace `prompt()` with modal | `fund-management.tsx` |
| `tradingpro-platform-2et` | STAB: Fix unsafe `error.message` access | `rm-management.tsx` |

### High Priority Issues

| ID | Title | File | Count |
|----|-------|------|-------|
| `tradingpro-platform-g5e` | Replace all `console.log` with Pino logger | 7 files | 40+ instances |
| `tradingpro-platform-l4r` | Add `credentials: "include"` to admin API fetch calls | 3 files | 7 calls |
| `tradingpro-platform-35x` | Replace freeform Input with Select for order type/side | `positions-management.tsx` |
| `tradingpro-platform-9fi` | Add accessible labels to Create Position dialog | `positions-management.tsx` |
| `tradingpro-platform-9ml` | Fix silent error swallowing in bulk operations | `orders-management.tsx` |

### Issue Categories

- **security** — XSS vulnerabilities, hardcoded credentials
- **mobile** — Touch targets, `prompt()` usage, overflow issues
- **stability** — Runtime crashes, error boundaries
- **validation** — Type safety, form validation
- **logging** — `console.log` violations (use `@/lib/logger`)
- **auth** — Missing `credentials: "include"`
- **accessibility** — WCAG compliance (labels, touch targets)
- **ux** — Empty states, `alert()` usage
- **bug** — Incorrect behavior, dead UI

---

### How to Pick Up an Issue

1. **Check what's ready:**
   ```bash
   cd /home/amansharma/Desktop/DevOPS/Trading/tradingpro-platform
   bd ready
   ```

2. **Claim the issue:**
   ```bash
   bd update <id> --claim
   ```

3. **Read the full details:**
   ```bash
   bd show <id>
   ```

4. **Make the fix** following the guidance in the issue

5. **Run quality gates:**
   ```bash
   npm run type-check    # TypeScript validation
   npm run lint          # ESLint check
   ```

6. **Close when done:**
   ```bash
   bd close <id>
   ```

---

### Key Patterns to Follow

**For XSS fixes:**
```tsx
// BEFORE (unsafe)
<span>{record.reason}</span>

// AFTER (safe)
<span className="text-red-600">{escapeHtml(record.reason)}</span>
// OR use a truncation helper
<span className="text-red-600">{record.reason?.slice(0, 200)}</span>
```

**For logging:**
```tsx
// BEFORE (violates policy)
console.log("User action: ", data)

// AFTER (correct)
import { logger } from "@/lib/logger"
logger.info({ requestId: crypto.randomUUID() }, "User action", { data })
```

**For fetch with auth:**
```tsx
// BEFORE (missing credentials)
const res = await fetch("/api/admin/users")

// AFTER (correct)
const res = await fetch("/api/admin/users", {
  credentials: "include"  // Required for cookie-based auth
})
```

**For error handling:**
```tsx
// BEFORE (crash risk)
catch (error: any) {
  toast({ title: "Error", description: error.message })
}

// AFTER (safe)
catch (error: unknown) {
  const message = error instanceof Error ? error.message : "Something went wrong"
  toast({ title: "Error", description: message })
}
```

---

## Non-Interactive Shell Commands

**ALWAYS use non-interactive flags** with file operations to avoid hanging on confirmation prompts.

Shell commands like `cp`, `mv`, and `rm` may be aliased to include `-i` (interactive) mode on some systems, causing the agent to hang indefinitely waiting for y/n input.

**Use these forms instead:**
```bash
# Force overwrite without prompting
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file

# For recursive operations
rm -rf directory            # NOT: rm -r directory
cp -rf source dest          # NOT: cp -r source dest
```

**Other commands that may prompt:**
- `scp` - use `-o BatchMode=yes` for non-interactive
- `ssh` - use `-o BatchMode=yes` to fail instead of prompting
- `apt-get` - use `-y` flag
- `brew` - use `HOMEBREW_NO_AUTO_UPDATE=1` env var

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
