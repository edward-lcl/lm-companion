# Completion-history contract

## Source path

`background.runSync` → `sync` → Moodle timeline + course-module discovery → bounded `assignmentStatus` GET reads → `snapshot.assignmentHistory` → `bar.buildPayload.history` → LMBar optional Codable history / Planner / Today disclosure.

Assignment reads use the existing browser fetch session (`credentials: include`), only canonical `https://core.xjtlu.edu.cn/mod/assign/view.php?id=<digits>` URLs. Extra query parameters are discarded. No quiz pages or submission actions are read/executed. At most 12 status reads per sync, with 10-second request timeouts; oldest attempted reads go first, including failures.

## Evidence and retention

- Positive evidence: `.submissionstatustable .submissionstatussubmitted` only. Explicit draft/new classes retract the current submitted status. Completion ticks, actionability, names and timeline disappearance are not submission evidence.
- `firstObservedSubmittedAt` records first positive observation, not the submission time. `submittedAt` remains absent/null because this reader does not extract an actual submission timestamp.
- Failed/unknown status reads retain last-known source evidence, never manufacture a completion. Failed active-feed reads do not infer disappearance. Partial reads are visible in LMBar.
- Manual handling stays in the existing browser/native marks, independent of source status. Native unchecking cannot erase source evidence.
- History is keyed by stable ID; exact assignment URL plus course identity preserves IDs across timeline/course fallbacks. Names are never used to join history records.
- Keep at most 300 assignment records, expiring 90 days after last active observation/discovery. Recent course-only assignments can seed history even when course completion removed them from the active feed; they still need a status-page read.
- Existing v1 native payloads without `history` and older items without evidence fields still decode. Hidden-course/item settings apply to bridge history; native hidden courses apply too.
- LMBar shows manual handling versus source verification separately, labels first-observed time explicitly, and keeps unknown disappeared assignments in History rather than outstanding or completed lists. History lives in a disclosure under Today and follows that section's visibility.

## Qualification

Synthetic tests exercise the real fetch/parse/sync/storage/bridge pipeline, parser negative controls, ID joins, expiry/cap, request bound/rotation and failed-read retention. Swift tests cover backward compatibility, manual/source distinctions, unknown history, same-name distinct IDs, deduplication and hidden courses.

Not live-qualified yet: confirm status markup against the user's authenticated assignment view; run a real sync and native bridge readback; inspect English/Chinese UI and reopening/undo behaviour. No install, restart, publication or live preference writes were performed for this patch. A source record unavailable from both retained history and course discovery cannot be reconstructed from a user self-report alone.
