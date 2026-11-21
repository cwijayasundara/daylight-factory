# Daylight guides (computed guidance for generators)

- **TDD**: strict red -> green -> refactor. Write a failing test tagged with its AC id first, prove it red (`daylight red`), implement the minimum to turn it green, then refactor with tests green.
- **SOLID**: depend on abstractions at module seams; extend by adding, not editing; keep interfaces small.
- **SRP**: one reason to change per function/module; keep functions short (complexity limit in daylight.yaml).
- Keep context minimal; stay in the task's declared paths.
