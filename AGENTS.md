# Instrucciones para agentes

Antes de modificar código, cada agente debe:

1. Leer este archivo y la documentación relevante en `docs/`.
2. Revisar `git status`.
3. Inspeccionar el código real relacionado con la tarea.
4. Verificar nombres y estructuras reales antes de asumirlos.

El repositorio actual prevalece sobre recuerdos de chats. La documentación registra intención y decisiones; si contradice el código, reportá la diferencia antes de resolverla. No inventes tablas, funciones, rutas ni infraestructura, y no modifiques la arquitectura silenciosamente.

La seguridad no se delega al frontend. No debilites autenticación, RLS ni ownership. No modifiques migrations ya aplicadas: cuando corresponda, creá una nueva migration. No ejecutes SQL remoto sin autorización explícita.

No hagas commit ni push sin autorización explícita.

Inspeccioná con foco: documentación → búsqueda de símbolos → archivos relacionados → dependencias inmediatas → tests relacionados. No leas mecánicamente todo el repositorio.
