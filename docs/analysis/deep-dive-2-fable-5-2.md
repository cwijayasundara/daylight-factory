# Deep dive 2: why brownfield keeps failing in a new way each run, and what to change

Read-only analysis by Fable 5.2 (claude-fable-5-2), 2026-11-21. Sources: plugin/src at commit 2ce8b72, the audit logs, plans, designs and escalation notes in the clones run-greenfield3/4/5 and run-brownfield8..12, and an offline replay of the current plan lint against the five saved brownfield plans. Numbers are recomputed from raw audit events. The plugin test suite is green (193 of 193) at the time of writing, which matters for the argument below.

Caveats: bh8 wall time includes operator gaps between sessions. Review calls (/code-review, /security-review) record no x_usage event, so every cost figure here and in STATUS.md understates the real spend. bh12 was killed mid-run, so it has no outcome for t3. Evaluator feedback text is not in the audit log (only citations), so evaluator failure classes are read from citations plus the escalation notes.

## 1. Headline

In five brownfield runs (bh8 to bh12) there were 30 failed task attempts. **None of them failed because the generated code did not work.** No attempt failed on tests, typecheck or lint. Every failure was a disagreement about the contract: who may edit which file, whether a test had to exist first, whether a waiver was credible, or an evaluator citing a file the task was not allowed to touch. The generated product code was accepted first time in 10 of 10 source-code tasks.

The failures are concentrated in one place. Every escalated task is the Docker task or the smoke-script task:

| task kind | brownfield first-attempt pass | escalated | recovered by retry in the same session |
|---|---|---|---|
| source tasks (t1, t2) | 10 of 10 | 0 | n/a |
| Docker / smoke tasks (t3, t4) | 3 of 8 | 5 | 0 of 5 |

Greenfield has the same weak spot (gh3 t4 and gh5 t3 both needed a second attempt), and half of all greenfield tasks (4 of 8) needed a second attempt. Greenfield passes because its failures are things a generator can fix (complexity 11 > 10, a missing healthcheck). Brownfield fails because its failures are things a generator cannot fix, and the only response the harness has is to ask the generator again.

So the question "why does it fail differently every time" has a plain answer: there is one structural hole (no coherent way to verify deliverables whose proof is running them), several inconsistent copies of the rules around that hole, and a fresh random design and plan each run that lands on a different edge of it. With about a 5 in 8 chance that a delivery task is unrecoverable, and one or two such tasks per plan, a run passing is the exception. Patching the edge that was hit last time does not move that probability much.

## 2. Measurements

### 2.1 Per-task outcomes (from x_task_start, x_task_end, verdict, x_usage)

| run | task | outcome | wall | generator calls / cost | evaluator calls / cost | harness fails | evaluator fails |
|---|---|---|---|---|---|---|---|
| gh3 | t1 | pass@1 | 65 s | 1 / $0.09 | 1 / $0.13 | 0 | 0 |
| gh3 | t2 | pass@2 | 504 s | 2 / $0.16 | 1 / $0.12 | 1 (complexity) | 0 |
| gh3 | t3 Docker | pass@1 | 66 s | 1 / $0.04 | 1 / $0.20 | 0 | 0 |
| gh3 | t4 smoke | pass@2 | 157 s | 2 / $0.18 | 2 / $0.33 | 0 | 1 |
| gh5 | t1 | pass@2 | 81 s | 2 / $0.14 | 1 / $0.15 | 1 (complexity) | 0 |
| gh5 | t2 | pass@1 | 489 s | 1 / $0.13 | 1 / $0.12 | 0 | 0 |
| gh5 | t3 Docker | pass@2 | 81 s | 2 / $0.07 | 2 / $0.24 | 0 | 1 |
| gh5 | t4 smoke | pass@1 | 48 s | 1 / $0.06 | 1 / $0.15 | 0 | 0 |
| bh8 | t1, t2, t4 | pass@1 each | 62-91 s | 3 / $0.37 | 3 / $0.46 | 0 | 0 |
| bh8 | t3 Docker | escalated, escalated, pass@2 (twice, after resumes) | 485 s | 11 / $0.54 | 9 / $0.71 | 2 | 7 |
| bh8 | fix1 | pass@1, then pass@5 on a resume, pass@1 | 322 s | 7 / $0.37 | 7 / $0.61 | 0 | 4 |
| bh9 | t1, t2 | pass@1 each | 42-82 s | 2 / $0.17 | 2 / $0.28 | 0 | 0 |
| bh9 | t3 Docker | escalated@5 (t4 blocked) | 280 s | 5 / $0.44 | 4 / $0.54 | 1 (scope) | 4 |
| bh10 | t1, t2, t3 | pass@1 each | 53-100 s | 3 / $0.28 | 4 / $0.48 | 0 | 0 |
| bh10 | t4 smoke | escalated after 2 | 40 s | 2 / $0.11 | 0 | 2 (TDD history) | 0 |
| bh11 | t1, t2 | pass@1 each | 88-242 s | 2 / $0.21 | 2 / $0.36 | 0 | 0 |
| bh11 | t3 Docker | escalated@5 | 228 s | 5 / $0.19 | 5 / $0.53 | 0 | 5 (same citation 5 times) |
| bh11 | t4 smoke | escalated@5 | 287 s | 5 / $0.42 | 4 / $0.57 | 1 (TDD history) | 4 |
| bh12 | t1, t2, t4 | pass@1 each | 54-78 s | 3 / $0.27 | 3 / $0.44 | 0 | 0 |
| bh12 | t3 Docker | in flight when killed (285 s before its first red) | - | - | - | - | - |

### 2.2 Where the brownfield money went (bh8 to bh12, $14.53 recorded)

| bucket | cost | share |
|---|---|---|
| design + plan, regenerated from scratch in every run | $5.69 | 39% |
| attempts on tasks that escalated (bh8 t3 and fix1 re-runs, bh9 t3, bh10 t4, bh11 t3 and t4) | about $5.0 | about 34% |
| everything else (tasks that passed, judge) | about $3.8 | about 27% |

For the three failed runs bh9 to bh11 alone ($7.80): design + plan $3.23 (41%), futile attempts on escalated tasks $2.80 and 835 s (36%), productive work about $1.78 (23%).

The Opus evaluator costs more than the Sonnet generator in every run: $4.99 against $3.37 over bh8 to bh12 (about 1.5 times), and about 1.7 times in greenfield.

### 2.3 Classification of the 30 failed attempts in brownfield

Evaluator failures (24):

| class | count | where | fixable by the generator? |
|---|---|---|---|
| TDD waiver "not credible" | about 11 | bh8 t3 (6), bh11 t4 (4), bh9 t3 (1) | No. At least 7 of these judged a **stale** waiver from an earlier, discarded attempt (see 3.4) |
| citation in a file the task may not edit, or a file no task creates | about 8 | bh11 t3 (5 times src/main.ts:4), bh9 t3 (3 times: src/main.ts does not exist) | No. Editing the file is a scope violation; not editing it fails the evaluator |
| evaluator given an empty AC list and an empty diff | 4 | bh8 fix1 on resume | No. Harness defect |
| other | 1 | bh8 t3 (deleted a test file) | Yes |

Harness (computational) failures (6): TDD first-commit history 5 (bh8 t3 twice, with the message "contains implementation but no failing test (impl: none)" on a commit of Docker files only; bh10 t4 twice; bh11 t4 once), scope 1 (bh9 t3 created src/main.ts, which the plan gave to nobody). One of these six also carried a real quality message (complexity 10 > 8 in scripts/smoke.ts).

For comparison, all four greenfield retries were on real, generator-fixable findings and all four passed on attempt 2.

### 2.4 Things that happen in every run, including the ones that passed

- **A trace fix round in 3 of 3 completed runs** (gh3, gh5, bh8). The Docker task is correctly exempt from TDD, so it writes no AC-named test; the trace matrix then reports NO TEST for its ACs (gh3 AC-11; bh8 AC-13, 15, 18, 21, 22) and a fix task is dispatched with broad paths and no TDD. That fix task writes tests that grep the Dockerfile for strings. In bh8 this fix task later cost 7 generator and 7 evaluator calls.
- **Wave barrier.** runInner awaits the whole ready set with Promise.all before starting the next wave. In bh11, t1 finished at 262 s but t2 and t3 could not start until the doomed t4 finished at 462 s: 200 s idle.
- **No fail-fast.** In bh11 the run was lost at 462 s (t4 escalated) but t2 and t3 ran for another 242 s.

## 3. Structural root causes

### 3.1 There is no verification model for deliverables that are proven by running them

The Dockerfile, the compose file, the smoke script and the entry point are proven by one thing: build the image, start it, hit /health, run the smoke script. The harness does exactly that, but only in the deploy phase, **after the squash merge into the base branch**. Until then, these deliverables are pushed through machinery built for unit-tested code:

- The design prompt in pipeline.ts requires ACs "covering behaviour, health endpoint, Docker deployment and smoke script", so every spec contains ACs whose proof is execution.
- trace.ts demands an AC-named test for every AC, with no exception.
- The evaluator rubric (skills/evaluator-rubric/SKILL.md) demands, for every task, "each AC is asserted by a test" and "tests were committed before implementation".
- plan.ts tddApplies exempts some tasks by a path regex (CODE_PATH), patched three times (config-only, then scripts/, then package.json).
- The evaluator has Read, Grep and Glob only. It cannot run anything, and says so ("I did not run docker compose up", bh11 t3; "the build/test status is not verified", bh8 judge). So it either accepts on reading or invents a static requirement.

No party in the loop executes the deliverable before merge. That is why bh9 t3 could be argued about for 5 attempts ("the container would fail to start" was true and nobody could show it), and why a deploy failure is found only after the PR has been merged.

### 3.2 The task contract exists in five copies that disagree

| rule | planner prompt | harness code | generator prompt | evaluator | trace |
|---|---|---|---|---|---|
| test files are always in scope | stated | implemented (TEST_FILE in contract.ts and judge.ts) | **not stated**: "Allowed paths: ... Stay in the allowed paths" | **not stated**; rubric criterion 4 says "only allowed paths changed" | n/a |
| TDD does not apply to this task | "tdd": false for no-behaviour tasks | path regex | stated only since the bh8 fix | **never told**; rubric criteria 1 and 2 still apply | every AC still needs a named test |
| what counts as red | n/a | first commit has tests and no source file, plus an x_red event from any attempt | "separate commits" | "tests were committed before implementation and fail without it", judged from a diff that has no commit order | n/a |
| a waiver exists | n/a | last declared waiver for the task id, from any attempt or session | may declare one | asked to judge it | n/a |

Direct evidence of the cost of this:

- The generator believed tests were out of scope in four attempts over three runs and declared a waiver for that reason: bh8 t3 ("no test location permitted"), bh10 t4 ("tests/ can't be touched"), bh11 t4 twice ("allowed paths exclude tests/"). In bh11 it went as far as deleting a correct test file to "respect scope".
- The evaluator believed the same thing: bh11 t4 attempt 3 fails with "tests/smoke.test.ts:1 is outside the t4 allowed paths", while the harness scope check had just accepted that file.
- The evaluator's advice in bh11 t4 was "widen t4's allowed paths, or merge it with the follow-up task". That is a request to change the plan, addressed to a generator that cannot change the plan.

Each recent patch edited one copy (the tddApplies regex, the generator's TDD paragraph, the plan lint) and left the others, which is why each patch produced the next symptom.

### 3.3 The plan is the real contract, and it is the least-validated artefact

The plan decides file ownership, AC ownership, TDD mode and task order. It is written in about 20 s by the cheapest model (cfg.models.triage, Sonnet, medium effort) and checked by regex heuristics over prose. When it is wrong, the defect shows up later as a "generator failure":

- bh9: t1 owned "src/" but did not create src/main.ts; t3 needed it. Creating it was a scope violation (attempt 2); not creating it failed the evaluator (attempts 1, 3, 4, 5). A deadlock between two checks, retried 5 times, $0.98 and 280 s.
- bh11: AC-17 (Dockerfile clause plus "the server defaults PORT to 8081") was given to t3; the default lives in src/main.ts, owned by t1, which chose 3000 because AC-17 was not in its prompt. Five identical evaluator failures citing src/main.ts:4.

The lint rules added in response are heuristics over backticked file names in architecture.md and spec.md. The offline replay (section 6) shows what they do:

- The "architecture.md names a file" rule pushes the planner from directory paths ("src/") to file-level paths. File-level paths are exactly what create cross-task coupling: bh10, bh11 and bh12 all have file-level plans; bh8 and bh9 did not.
- The "AC names a file another task owns" rule would have caught bh11's AC-17 only because the AC happened to mention src/main.ts in backticks. "The server defaults PORT to 8081" without a file name passes the lint.
- The planner's response to that rule in bh12 was to add src/main.ts to the Docker task. That makes tddApplies true for the Docker task (the replay shows bh12 t3 as the first Docker task with TDD required), which re-opens the bh8 problem from the other side. bh12 t3 was 285 s in when the run was killed.

The design phase feeds this. The design prompt asks for a file-by-file architecture, which the evaluator then treats as requirements (gh3 t4 failed for "architecture.md:36 says set process.exitCode"; gh5 t3 failed for "architecture.md:31 requires a healthcheck"). design.ts lint checks only that an AC contains a verb or a digit. Nothing checks that an AC is about one artefact, so compound ACs such as bh11 AC-17 and meta ACs such as bh8/bh9 AC-18 ("npm test passes, lint and tsc exit 0") go through and become NO TEST rows or split ownership later.

### 3.4 The evaluator's inputs are unstable, and some are wrong

- **Stale waiver (harness bug, still present).** waiverFor(cwd, task) in tdd.ts returns the last declared waiver for the task id from the whole audit log. It is not scoped to the current attempt and not gated by tddApplies. loop.ts passes it to the evaluator with "Fail the task with a citation if the waiver is not credible". Consequences: in bh11 t4, attempt 1 declared a waiver and was reset; attempt 2 did proper TDD (red recorded at 213 s, harness checks passed) and was failed by the evaluator for the attempt-1 waiver; attempt 3 the same. In bh8, a waiver declared at 377 s in session 1 was replayed to the evaluator in all 5 attempts of session 2 (the escalation note quotes the session-1 waiver text), after the task had been made TDD-exempt. This is what "the evaluator re-litigates waivers" actually is: the harness keeps handing it the same dead waiver.
- **The rubric is passed by name, not by content.** The prompt says "against the evaluator-rubric skill" with no path, the working directory is the task worktree, and the evaluator has no Skill tool. It usually finds the file by globbing outside the worktree; sometimes it does not ("I couldn't find the evaluator-rubric skill file in the repo, so I graded against the AC text", bh11 t3; the same in bh8 fix1). The grading standard therefore varies by attempt.
- **It reads the audit log** and cites it against the generator (bh11 t4 cites audit event e106, the pre-reset failure, as evidence against a post-reset attempt).
- **It re-judges what the harness already decided** (rubric criteria "tdd" and "scope") with different rules from the harness (3.2). Two judges with different rule books is double jeopardy.
- **It sees a diff cut at 20,000 characters and only its own worktree**, and it cannot execute.
- **On fix tasks it can receive nothing.** bh8 fix1 on resume: empty AC list and empty diff, four failures citing exactly that.

### 3.5 Failure handling has one verb: retry the generator

- failureClass in contract.ts knows two classes and two regexes (timeouts and unusable verdicts are "harness", everything else "generator"). All five escalations above were logged as failure_class "generator". None was.
- Repeat detection (repeatsPrevious) covers computational messages only. bh11 t3 produced the same evaluator citation five times.
- Nothing checks whether the generator is able to act on the feedback. A citation in a file outside the task's paths is unfixable by construction and is cheap to detect.
- A retry gets the previous diff and the feedback, but no new capability: same paths, same plan, same contract.
- Escalation is terminal for the run. There is no re-plan, no path widening, no hand-off to the owning task. The operator's only tools are --resume and editing run-state.json by hand.

### 3.6 Every run re-rolls design and plan, so no fix has ever been tested against the case it was written for

bh8 to bh12 produced specs with 26, 19, 18, 20 and 22 ACs and five different task shapes. A fix written for bh9's plan was "verified" on bh10's plan, which did not have that defect and had another. With a per-run pass chance somewhere around a quarter, one live run per fix cannot tell a fix from noise. $5.69 of $14.53 went to regenerating design and plan.

The stubbed end-to-end test does not close this gap. Its generator stub always commits a test, records red, then commits the implementation, and its evaluator stub always passes. It proves the mechanism runs; it cannot show that the rules are coherent with what real models produce. That is how the suite is 193 of 193 green while live brownfield is 1 of 5 with operator help. There is no corpus of real plans, specs and task branches to test against.

### 3.7 Integration evidence arrives last

Per-task sensors (tests, typecheck, lint) do run in each worktree and dependencies are merged before a dependent task starts, so a dependent task does see its dependencies. But "does the application start and answer" is only checked by deploy, after merge. Parallel tasks cannot see each other, and file-level ownership forbids a later task from adjusting an earlier task's file even when it runs strictly after it.

### 3.8 Latent defects found while reading (not yet hit, or hit once)

1. fixTask appends the fix task to .daylight/plan.json. On a resume the inner phase loads it as a normal task; a second fix round in a new session reuses the id fix1 (bh8's plan.json contains two fix1 entries), and addWorktree reattaches to the old, already-merged branch, so the diff is empty.
2. addWorktree reuses an existing worktree and branch as they are. STATUS.md says a resumed task "is rebased onto the run head"; there is no rebase in the code. An implementation-first history survives a resume; needsFreshStart only resets within a session.
3. tddCheck accepts an x_red event from any attempt, including one before a reset.
4. tddCheck's message for a commit with no source and no tests is "contains implementation ... (impl: none)".
5. bh11 has an x_red event with task undefined and tail "bash: undefined: command not found": daylight red was run without --task/--cmd and still recorded a red.
6. The complexity sensor scans scripts/ at limit 8, while the repo's own eslint covers src only. The harness is stricter than the repository it claims to respect (bh11 t4 attempt 1).
7. Review calls record no cost.
8. If the plan loop fails its checks three times it falls through silently with whatever plan.json exists (already noted in the first deep dive; still true).

## 4. Why greenfield passes and brownfield does not

Same harness, same hazards. The differences:

1. **Loose ownership.** In an empty repo the planner writes directory paths (gh3: "src/", "scripts/"; gh5 the same). Nothing forces file-level ownership, so there is no scope deadlock. Brownfield plans became file-level, partly because of our own lint rule.
2. **Fewer and simpler ACs**: 12 and 15 against 18 to 26, with fewer compound or meta ACs (the brownfield PRD adds "existing tests keep passing, lint complexity 8 and type check stay clean" and "follow the conventions").
3. **Fewer veto points**: required sensors are tests and secrets only, with complexity 10; brownfield adds typecheck, lint and complexity 8.
4. **Its failures happened to be generator-fixable.** That is the luck part. The contract holes are the same: gh4 failed entirely on TDD rules, greenfield smoke and Docker tasks are also its retry hot spots, and both greenfield passes needed the trace fix round.

Greenfield passing twice is evidence that the looser shape works, not that the strict shape is sound.

## 5. Is the architecture the right shape?

No, not for work of this size. My assessment of each element:

- **Many small tasks.** The feature is about 300 lines. Source tasks take 60 to 90 s each and pass first time. Splitting into four tasks buys little parallelism (the wave barrier cancels most of it) and creates the whole ownership problem, which then needs a lint rule per failure. Decomposition should be the exception, justified by size, not the default.
- **Strict TDD by git-history forensics.** What needs guaranteeing is that each behavioural AC has a test that fails without the implementation and passes with it. Commit order is a proxy, and a brittle one: it cannot be repaired after the fact (hence the reset), it needs a waiver channel, and the waiver needs a judge. The real property can be checked directly and deterministically: run the task's new test files against the base tree and require them to fail, then against the task head and require them to pass.
- **An Opus evaluator per task.** It costs 1.5 times the generator and, in brownfield, about 23 of its 24 failures were not actionable by the generator. Its two greenfield failures were useful. It is worth keeping for what a reader can judge (does the test really assert the AC; is there an obvious defect) and should lose everything the harness can decide (TDD, scope) or that only execution can decide (deployment).
- **Patching.** The last four commits each removed one edge and the offline replay shows two of them moving the problem (file-level paths; Docker task acquiring TDD). I would stop adding lint rules.

A simpler, more robust shape:

1. **Verification mode is a property of the AC, declared once at design time.** Each AC is tagged: [test] (an AC-named automated test), [run] (proven by building, starting and smoke-testing the service), or [sensor] (proven by a named sensor: lint, typecheck, complexity, existing tests). Everything downstream derives from the tag: plan placement, whether TDD applies, what trace accepts as evidence, what the evaluator is asked. This replaces the CODE_PATH regex, the META regex, the "tdd": false flag and the waiver.
2. **A fixed two-stage plan by default.** One or more *behaviour* tasks in a linear chain (all [test] and [sensor] ACs; own src/ and tests/), then exactly one *delivery* task last (all [run] ACs; owns Dockerfile, compose, scripts/, package.json scripts). The planner's job shrinks to choosing where to cut the behaviour chain when it is large.
3. **Cumulative ownership.** A task may edit any file owned by a task in its dependency closure. It runs strictly after them, so there is no conflict to protect against. This alone removes the bh9 and bh11 t3 deadlocks without any lint heuristic.
4. **Delivery is verified by execution before the PR**, in the delivery task's attempt loop: compose build and up, health, smoke, compose down. Failures are fed back like any sensor message. No LLM evaluator for the delivery task; no test-first requirement.
5. **Branch-level TDD evidence** for behaviour tasks: new AC-tagged tests fail at base and pass at head. No commit-order rule, no waiver, no reset.
6. **Failure triage by who can fix it**: generator, plan, harness or environment. Only the generator class is retried. The plan class stops at once with a precise reason (or applies one mechanical repair).
7. **A narrower evaluator** with the rubric inline, told the facts the harness has already established.

## 6. Offline replay of the failing plans (done for this report, no model calls)

I ran the current lintPlan, checkPlan and tddApplies against the saved spec, architecture and plan of each brownfield run (existing-file set taken from the bh9-base tree):

| run | ACs | current lint verdict on the plan that ran | TDD required per task (current rules) | what would happen next under current rules |
|---|---|---|---|---|
| bh8 | 26 | rejects: AC-13 and AC-21 name files of another task; scripts/smoke.ts has no explicit owner | t1, t2 yes; t3, t4 no | n/a (historical) |
| bh9 | 19 | rejects: 5 unowned architecture files; AC-13 names src/main.ts | t1, t2 yes; t3, t4 no | the planner must rewrite to file-level paths |
| bh10 | 18 | **accepts** | t1, t2 yes; t3, t4 no | t4 no longer needs TDD, so no AC-named test for AC-15/16; trace reports NO TEST; fix round with no ACs and broad paths |
| bh11 | 20 | rejects: AC-17 names src/main.ts owned by t1 | t1, t2 yes; t3, t4 no | the planner gives t3 src/main.ts (this is what bh12 did) |
| bh12 | 22 | accepts | t1, t2 yes; **t3 yes**; t4 no | the Docker task now needs a failing test first: the bh8 t3 situation again |

Predicted next failures if nothing structural changes: (1) a Docker task that owns src/main.ts fails TDD history or writes string-matching tests; (2) the trace fix round after a "passing" inner loop, with an evaluator that receives no ACs; (3) the evaluator failing a TDD-exempt task on rubric criterion 1 or 2; (4) the stale waiver on any task whose first attempt declared one; (5) a compound AC that does not happen to name a file.

## 7. Fix plan, in order of leverage

Each item is test-first. "Corpus" means the fixture set defined in section 8.1, which is item 0 because it makes every other item checkable in seconds.

### Before the next live run

**0. Build the corpus and the replay commands (half a day).**
- Removes: 3.6 (no fix is tested against its own case).
- Change: add plugin/tests/fixtures/corpus/<run>/ for bh8, bh9, bh10, bh11, bh12, gh3, gh5 containing spec.md, architecture.md, plan.json (fix tasks stripped), base-files.txt, a git bundle of the base commit plus the daylight/t* branches, and verdicts.json (the verdict events from the audit log). Add a pure CLI command "daylight contract check --plan --task --base --branch" in src/cli.ts that prints the computational verdict for a branch with no model call.
- Tests first: tests/corpus.test.ts, table-driven. Initial assertions pin today's behaviour (section 6 table) so that later items flip specific rows deliberately.
- Risk: fixtures contain generated code from the sample repos only; check for the operator email and hostname before committing (the bh8 audit needed redaction).

**1. One source of truth for the task contract, told to every party (2 to 3 hours).**
- Removes: 3.2, and the deadlocks in 3.3.
- Change: new function taskContract(task, plan) in src/contract.ts returning { editable: own paths plus the paths of every task in the dependency closure; testsAllowed: true; mode: 'tdd' | 'run' | 'none' }. Use it in scopeViolations (contract.ts), scopeCheck (judge.ts), the generator prompt (context.ts generatorContext and tddInstruction) and the evaluator prompt (loop.ts). The generator prompt must say in words: "Test files (tests/, *.test.ts) are always allowed. You may also edit files owned by the tasks you depend on: <list>."
- Tests first: contract.test.ts: a dependent task editing a dependency's file is not a violation; an independent task doing so still is. Corpus: bh9 t3 attempt 2 (created src/main.ts) and a bh11 t3 that edits src/main.ts are accepted by "contract check". Prompt tests: generator and evaluator prompts for corpus task bh11 t4 contain the tests-allowed sentence.
- Effect: bh9 t3 and bh11 t3 become fixable by the generator on the first retry; the four "tests are out of scope" waivers do not arise.
- Risk: a later task can now change an earlier task's code. That is acceptable because all sensors re-run on it and the run judge reads the whole diff.

**2. Remove the stale waiver and scope evidence to the current attempt (1 hour).**
- Removes: 3.4 first bullet; about 7 of the 24 evaluator failures.
- Change: in loop.ts record the audit event id at the start of each attempt and after each reset; waiverFor and the x_red lookup in tdd.ts take a "since" id; do not pass any waiver to the evaluator when the task's mode is not 'tdd'. Make "daylight red" refuse to run without --task and --cmd (latent defect 5).
- Tests first: inner.test.ts with a scripted generator: attempt 1 declares a waiver and fails a sensor, attempt 2 records a real red; assert the attempt-2 evaluator prompt contains no waiver text. A second test: a red recorded before a reset does not satisfy tddCheck after it.
- Risk: none identified.

**3. Failure triage by who can fix it; stop retrying what the generator cannot fix (2 to 3 hours).**
- Removes: 3.5; about $2.80 and 835 s of futile attempts in bh9 to bh11.
- Change: replace failureClass in contract.ts with classifyFailure(messages, citations, contract) returning 'generator' | 'plan' | 'harness'. Rules: every cited file is outside contract.editable and is not a test file -> plan; the same set of evaluator citations on two consecutive attempts -> plan; a scope violation on a file no task owns -> plan; timeouts, unusable verdicts, empty AC list or empty diff -> harness. In runTask, a plan or harness class ends the attempt loop immediately and writes the class and the reason into the escalation note and the x_escalation event. Extend repeatsPrevious to evaluator citations. In runInner, stop launching new tasks once any task has escalated (fail-fast), unless a flag asks to continue.
- Tests first: replay verdicts.json through a recorded-evaluator stub (DAYLIGHT_CLAUDE pointing at a script that returns the recorded verdicts in order): bh11 t3 must stop after at most 2 evaluator calls (5 today) with class plan; bh9 t3 must stop after attempt 2 with class plan; a greenfield-style case (complexity message, then pass) must still retry and pass.
- Risk: a false "plan" classification ends a task that one more retry would have fixed. Keep the rule narrow (all citations outside the editable set) and log the evidence.

**4. Verification mode per AC, and delivery verified by execution before the PR (half a day; the largest item and the one that closes the hole).**
- Removes: 3.1, the trace fix round in every run (2.4), and the regex chain in tddApplies.
- Change:
  - Design: in the design prompt (pipeline.ts) and skills/design/SKILL.md require a tag on each AC: "- **AC-n** [test|run|sensor:<name>] <condition>". In design.ts lint: every AC has a tag; a [sensor:x] AC needs x in sensors.required; an AC that mixes a deployment artefact with code behaviour is reported as compound and must be split (start simple: an AC tagged [run] that also names a file under src/, or an AC with two sentences whose backticked files fall in different groups). Untagged ACs default to [test] so old specs still load.
  - Plan: plan.ts gains acModes(spec). Task mode is 'run' when all its ACs are [run], 'tdd' when it has any [test] AC, otherwise 'none'. planlint.ts: all [run] ACs sit in one task, and that task depends (directly or transitively) on every other task; a task may not mix [run] with [test] ACs. tddApplies becomes "mode is tdd" and the CODE_PATH regex goes.
  - Loop: for a 'run' task, after the generator returns, run the delivery check in the worktree as a computational check: a new function verifyDelivery(cwd, cfg) extracted from deploy() in src/deploy.ts (compose up with build, health wait, smoke command, compose down, logs on failure), without the Gate 2 approval check, logging x_delivery. Its failure message is fed back to the generator. No LLM evaluator call for a 'run' task that passes this check. deploy() after merge stays as it is and reuses the same function.
  - Trace: matrix() in trace.ts takes the AC modes and an evidence object; a [run] AC is PASS when the latest x_delivery for the run is ok, a [sensor:x] AC is PASS when sensor x is green; only [test] ACs need an AC-named test.
- Tests first: design.test.ts (tag required; compound AC rejected; sensor tag needs the sensor); planlint.test.ts (run ACs in one last task); trace test (a [run] AC with delivery evidence is PASS, without it is NO EVIDENCE); inner.test.ts with the docker stub from pipeline.test.ts (a run task with a failing health command gets the message back and no evaluator call; a passing one passes with zero evaluator calls); pipeline.test.ts (no fix round when the only untested ACs are [run]).
- Effect: the Docker and smoke ACs get the one proof that means something, before merge; the every-run fix round disappears; the Docker task can never again be asked for a failing unit test.
- Risk: the delivery check binds the real host port (8081) during the inner loop. Preflight already requires the port to be free; the check must always run compose down, including on failure and timeout. It adds 20 to 60 s to the delivery task. Docker being unavailable is an environment class failure, not a generator one.

**5. Narrow the evaluator and give it stable inputs (1 to 2 hours).**
- Removes: 3.4; evaluator cost on delivery tasks.
- Change: in loop.ts inline the rubric text into the evaluator prompt (read skills/evaluator-rubric/SKILL.md at start-up). Rewrite the rubric to three criteria: ac-met (each [test] AC of this task is asserted by a test that checks the behaviour), no-defects (cite file:line), conventions (brownfield only, cite the convention). Delete the tdd and scope criteria. Add a "Facts established by the harness" block: scope check passed, TDD evidence passed, sensors green, files this task may edit, and "architecture.md is guidance; fail only against AC text". Tell it not to read .daylight/. Pass AC text (not just ids) and, for fix tasks, the findings being fixed; if a task has no ACs and no findings, do not call the evaluator at all.
- Tests first: prompt tests (rubric text present; facts block present; no "evaluator-rubric skill" by-name reference); inner test: a fix task with an empty diff makes zero evaluator calls and is reported as class harness.
- Risk: a narrower rubric catches less. The run judge and both reviews still read the whole diff.

**6. Default plan shape: behaviour chain plus one delivery task (1 to 2 hours).**
- Removes: 3.3 at the source; makes the two newest lint rules unnecessary.
- Change: rewrite the planner prompt in pipeline.ts: "one behaviour task unless the spec has more than about 15 [test] ACs, then a linear chain of at most three; exactly one delivery task, last; directory-level paths for behaviour tasks". **Delete** from planlint.ts the "architecture.md names a file" rule and the "AC names a file another task owns" rule (cumulative ownership and AC modes cover both cases without prose heuristics), and the META regex (replaced by [sensor] tags). Make the plan loop stop the run when lint still fails after three tries instead of falling through. Change the design prompt to ask architecture.md for modules and responsibilities, not a binding file list.
- Tests first: corpus: gh3, gh5 and the re-shaped versions of bh9 to bh11 are accepted; a plan with two tasks holding [run] ACs is rejected; a pipeline test where the plan stub fails lint three times stops at stage plan.
- Risk: one larger behaviour task raises the chance of a complexity or context problem in a single attempt. The data says source tasks of 12 to 14 ACs already pass first time (bh9 t1 13 ACs, bh11 t1 13, bh12 t1 14), so the risk looks small at this size; the chain rule covers larger specs.

### Can wait until after the first clean runs

7. **Branch-level TDD evidence** (half a day). New function redAtBase(cwd, base, branch, testCmd) in tdd.ts: create a temporary worktree at base, check out only the branch's new and changed test files into it, run the test command; require a non-zero exit there and a zero exit at head, and require AC ids in the new tests. If the tests already pass at base, log x_already_satisfied for those ACs and accept. Then **delete** the first-commit check, needsFreshStart and the branch reset, the --waive option, waiverFor and the waiver clause in the evaluator prompt. This needs an ADR, because AC-38/AC-39 of the factory's own design are worded in terms of commit order. Tests: tdd tests with a fixture repo (tests fail at base and pass at head -> ok, in any commit order; tests pass at base -> already satisfied; no new tests -> fail). Until this lands, items 1, 2 and 4 remove the known triggers.
8. **Frozen-plan runs**: flags --design-from <dir> and --plan-from <file> on daylight run, which copy the artefacts, run design lint and plan lint, mark the phases done and go straight to the inner loop. This replaces hand-editing run-state.json and is the cheap live mode in section 8.
9. **Fix tasks**: keep them out of plan.json (store under run-state), give them unique ids per session, and make addWorktree create a fresh branch at the run head when the existing branch is already merged. Covers latent defects 1 and 2.
10. **Scheduler**: start a task as soon as its dependencies have passed, not at the next wave. Mostly moot with a chain, still right.
11. **Sensor scope**: the complexity sensor should use the same file set as the repo's lint (or just rely on the repo's lint when one is configured).
12. **Record review cost** so run cost is real.
13. The open items already in STATUS.md (port held by the previous run's container, triage by AC count, high-tier body-only defects).

### Delete list (all in one place)

CODE_PATH regex and "tdd": false in plans (item 4); META regex, architecture-file ownership rule and AC-names-file rule in planlint.ts (item 6); rubric criteria "tdd" and "scope" (item 5); waiver flow, first-commit check, branch reset (item 7); LLM evaluator calls for delivery tasks and for empty fix tasks (items 4, 5). The harness gets smaller, not larger.

### What this should do to the numbers

Expected, not measured: delivery-task unrecoverable failures from 5 of 8 to near zero (they become ordinary feedback loops on a real docker error); evaluator calls per run from 4 to 6 down to 1 to 3; no trace fix round; futile-retry spend from about a third of the run to a few percent. A clean brownfield run should be near $2.5 and 8 to 10 min. These are the figures to check in section 8.

## 8. Acceptance protocol

### 8.1 Offline replay (free, seconds) - run on every harness change

- **Level 0, static**: tests/corpus.test.ts runs design lint, checkPlan, lintPlan and acModes over each saved (spec, architecture, plan). Assertions per fixture: accepted or rejected, and for which reason. Greenfield fixtures must stay accepted (guards against over-tight rules).
- **Level 1, contract on real commits**: for each fixture, unbundle the saved branches into a temp repo and run "daylight contract check" on every attempt commit of every task. Assertions: the commits that were wrongly rejected (bh9 t3 attempt 2, bh10 t4, bh11 t4 attempt 2, bh8 t3 Docker-only commit) are now accepted or rejected with a generator-actionable message; nothing that passed before is now rejected.
- **Level 2, recorded evaluator**: run runTask with DAYLIGHT_CLAUDE set to a script that replays verdicts.json. Assertions on call counts and failure class (bh11 t3: at most 2 evaluator calls, class plan). Also snapshot the generator and evaluator prompts for each corpus task and assert the contract sentences are present and no stale waiver appears.
- Rule: **every future live failure is first added to the corpus and reproduced offline, and only then fixed.** If it cannot be reproduced offline, the corpus tooling is what gets fixed first.

### 8.2 Frozen-plan live runs (about $0.5 to $1.2 and 3 to 6 min each)

Using item 8: take the saved design and plan of bh9, bh10 and bh11 (re-tagged with AC modes), run the inner loop only (--stop-after inner) from a throwaway branch at 86591ed. Two runs of each, six in total. Pass condition: 6 of 6 with all tasks passed, no escalation, no failure classed plan or harness, mean attempts per task at most 1.5. This isolates the inner loop from the design and plan dice and costs about a third of a full run.

### 8.3 Full unattended runs

- PRD A: the current brownfield notes-API PRD, 5 runs, each from a fresh throwaway branch at 86591ed.
- PRD B: a second brownfield PRD of a different shape on the same sample after PRD A is merged on a scratch branch: change existing behaviour and add one endpoint (for example pagination on GET /notes plus DELETE /notes/:id), with no new deployment files. 3 runs. This checks the harness was not tuned to one PRD and exercises "behaviour already exists".
- Greenfield regression: 2 runs.
- A run is **clean** when: exit ok, deployed and smoke passed, 0 touchpoints, 0 resumes, no edit to run-state or generated code, and no harness commit during the series. Any harness change resets the count.
- **"Stable" = 10 of 10 clean.** Be honest about what that shows: 10 of 10 supports a true pass rate above roughly 74% at 95% confidence; 5 of 5 supports only about 55%. A claim of 90% needs about 29 clean runs. So declare stable at 10 of 10, then keep a rolling pass rate over the next 20 runs and treat any failure as a corpus addition.
- Measure per run and report as a table: pass or fail and stage; first-attempt task pass rate; attempts per task; escalations by class; fix rounds; evaluator calls and cost; evaluator precision (share of evaluator failures followed by a generator change that then passes with no contract change); share of cost that is rework; wall time; total cost including reviews.
- Budget: about 10 full runs at about $3 plus 6 frozen-plan runs: roughly $35 and 2.5 hours of wall time, against $14.53 already spent on bh8 to bh12 for one assisted pass.

## 9. Risks and unknowns

- The "expected effect" figures in section 7 are estimates from five runs; the corpus and the protocol in section 8 exist to replace them with measurements.
- Classification of evaluator failures in 2.3 is from citations and escalation notes; a few may be misfiled between "waiver" and "other". The stale-waiver finding itself is certain from the code (waiverFor has no attempt scope) and from the bh8 escalation note quoting the session-1 waiver.
- A single behaviour task may not scale to large PRDs; the chain rule is the mitigation and should be tested with a deliberately large PRD before claiming more than "small and medium features".
- Running the delivery check inside the inner loop needs Docker during that phase and holds the service port briefly.
- Narrowing the evaluator and removing commit-order TDD are deviations from the factory's approved design (AC-38, AC-39, the evaluator rubric); they need ADRs.
- My scratch replay used a fixed list of base files for "exists"; live lint checks the working tree. This affects only one spurious message (.daylight/ingest/conventions.md), which I excluded from the table in section 6.
