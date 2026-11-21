# Code Mode on vs off (AC-88)

Task: read 6 plugin source files and run one test file; report total lines and pass count. Model: Sonnet 5.5 in both arms.

| metric | Code Mode on (one REPL batch, this session) | Code Mode off (`claude -p`, env var removed) |
|---|---|---|
| tool round trips | 1 | 9 turns |
| script/wall-clock | 0.79 s (REPL batch execution only) | 151.4 s (whole headless run) |
| input / output tokens | not recorded: the interactive transcript shows zero usage for Code Mode turns | 8 + 31,494 cache-created in / 1,055 out (88,238 cache-read) |
| answer | LINES=134, pass 6 (correct) | LINES=134, PASS=116 (wrong: the file has 6 tests) |

**Conclusion: no savings claim is made.** The arms are not comparable: the on-arm time excludes the model's own thinking and generation time, its tokens are unobservable here, and the off arm gave a wrong answer. What the data do show is a 9x reduction in tool round trips for this task, which is what batching is for; whether that saves tokens or wall-clock overall needs a run where the interactive arm's usage is observable (e.g. via OTel). `daylight benchmark compare` refuses to print a comparison when an arm has no data.
