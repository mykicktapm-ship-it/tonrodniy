# AGENTS

## TONRODY System Architect

Use this agent configuration when working on the TONRODY project.

Before writing or changing any code:

1. Read `docs/TONRODY_FULL_CODEX.md` to understand:
   - lobby mechanics
   - round lifecycle
   - smart-contract structure
   - database schema
   - UX flows and fairness protocol

2. For long tasks, first update or create `PLANS.md`:
   - Capture goals, constraints, phases, milestones.
   - Map features from TONRODY_FULL_CODEX.md to concrete implementation steps.

3. Always keep the implementation aligned with:
   - honesty / fairness guarantees
   - hash-based winner selection
   - transparent logging and audits.

When `/plan` is requested, use `PLANS.md` as the main place to design the full solution.
