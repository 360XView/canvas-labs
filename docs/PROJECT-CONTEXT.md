# Canvas Labs - Project Context

**Last Updated:** January 26, 2026

---

## What This Is

Canvas Labs is a **research prototype** for exploring AI-assisted learning. It's infrastructure for experimentation, not a production application.

---

## Core Research Questions

1. **Tutor Effectiveness** - How well can Claude Code guide students through hands-on labs?
2. **Personalization** - Can the tutor learn about a student over time and adapt its approach?
3. **Evaluation** - Can we measure tutor quality using AI-based simulated students?
4. **Content Variety** - Do different lab types (CLI, Python, Splunk) need different tutoring strategies?

---

## What Matters

| Area | Priority | Notes |
|------|----------|-------|
| Tutor-Lab-VTA interaction | High | Core research area - how components work together |
| Rich interaction logging | High | Need data to understand what happened in sessions |
| Easy experimentation | High | Swap prompts, try new lab types, iterate fast |
| Extensibility | Medium | Keep doors open for memory, eval, simulation systems |
| CI/CD | Medium | Useful for AI agent-driven development and testing |
| UI polish | Low | Minimal UI, just enough for fast prototyping |
| Code structure | Low | Prototype - optimize for speed of experimentation |

---

## Future Systems (Placeholders)

These are on the roadmap but not designed yet:

- **Agent Memory System** - Tutor accumulates knowledge about student, improves over time
- **Simulated Students** - AI-based students for evaluating tutor effectiveness
- **Tutor Evaluation Framework** - Metrics and tooling to measure tutoring quality
- **Course Effectiveness Analysis** - Understanding which content/approaches work

---

## Architecture Implications

When analyzing or modifying the system, focus on:

1. **Can you easily experiment with different tutor prompts?**
2. **Can you capture rich data about tutor-student interactions?**
3. **Can you add new lab types without breaking existing ones?**
4. **Is the system observable enough to understand what happened in a session?**

Don't prioritize:
- Code cleanliness for its own sake
- Production hardening
- UI/UX polish
- Performance optimization

---

## Related Documents

- [Architecture Analysis](./plans/2026-01-26-canvas-labs-architecture-analysis.md) - Technical deep dive
- Roadmap and vision - TBD (working with product manager)
