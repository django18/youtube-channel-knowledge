# Gemini CLI Instructions: YouTube Knowledge Engine

## Specialist Skill Routing
This project uses a suite of specialist skills located in `.claude/skills/`. Whenever a user issues a command starting with `/`, the agent must follow this protocol:

1. **Lookup:** Search for a directory in `.claude/skills/` that matches the command name (e.g., `/office-hours` -> `.claude/skills/office-hours/`).
2. **Read:** If found, read the `SKILL.md` file within that directory.
3. **Adopt Persona:** Strictly follow the methodologies, forcing questions, and decision principles defined in that skill file.
4. **Output:** Execute the skill's specific task (e.g., audit, review, or brainstorm).

### Available Commands:
- `/office-hours`: YC-style product reframing.
- `/plan-ceo-review`: Strategic scope and value review.
- `/plan-eng-review`: Architecture and technical debt audit.
- `/plan-design-review`: UX/UI and "AI Slop" detection.
- `/review`: Staff Engineer code and logic audit.
- `/investigate`: Systematic debugging (Iron Law: no fixes without investigation).
- `/qa`: End-to-end testing and bug fixing.
- `/cso`: Security and threat modeling.

## Development Workflow
1. **Research:** Use `grep_search` and `read_file` to understand current implementation.
2. **Strategy:** Propose changes using a specific Specialist Skill if requested.
3. **Execution:** Apply surgical edits and verify with tests.

## Knowledge Engine Standards
- **Dual-Memory:** All extractions must persist to both ChromaDB (Semantic) and Neo4j (Graph).
- **Traceability:** Every playbook lesson must be backed by `Evidence` from a source video.
- **Verification:** Use the `/review` skill after any major logic change in `src/lib/extraction/`.
