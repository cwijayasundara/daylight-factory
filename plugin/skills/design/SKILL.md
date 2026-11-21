---
name: design
description: Outer loop. Turn a PRD (with NFRs) into intent.md, spec.md and architecture.md, lint them, and open Gate 1. Use at the start of /daylight:run after triage and (for brownfield) ingest.
---
Reuses Superpowers `brainstorming` and mattpocock `grill-with-docs` / `to-spec`; this skill only fixes the outputs and the gate.

1. `daylight prd check <prd>` (refuse if the NFR section is missing).
2. Read the wiki/conventions if brownfield. Use the Superpowers brainstorming flow to settle open questions; ask the human only for decisions the PRD cannot answer.
3. Write to the design dir (`daylight config --resolved`.design_dir): `intent.md` (## Why, ## Success criteria with numbers), `spec.md` (one `- **AC-n** <observable condition>` per criterion, unique ids), `architecture.md` (ADRs with Status/Context/Decision/Consequences, and an `NFR mapping` table with a row `| NFR-n | mechanism |` per PRD NFR).
4. Run `daylight design lint --prd <prd>`; fix every error.
5. `daylight gate request design`, then present with `daylight gate present design`.
6. Approver: human -> ask and record `daylight gate decide design --decision approve|reject|edit --source human [--feedback ...]`; agent -> `daylight gate agent design`.
7. On reject: `daylight gate context design` gives the feedback; revise, `daylight design stamp`, repeat. After the retry cap the gate needs a human.
Never start the inner loop until `daylight inner-start` exits 0.
