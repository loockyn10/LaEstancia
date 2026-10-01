# Flujo de trabajo multi-agente

ChatGPT cumple el rol de Product & Software Architect. Codex es el agente principal de implementación. Claude Code puede implementar, explorar y revisar.

El chat contiene contexto temporal; el repositorio y sus documentos son la memoria permanente. Trabajamos en sprints pequeños, idealmente con 1–3 prompts sustanciales por contexto. Al cerrar una feature, cerramos su contexto; si cambia la naturaleza de la tarea, se abre otro contexto.

Los handoffs se realizan dejando el estado y las decisiones en el repositorio y en `docs/`. Para trabajo paralelo se usan worktrees separados. Dos agentes no escriben sobre el mismo working tree.
