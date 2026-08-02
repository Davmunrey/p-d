# Skills del proyecto

Estas skills se cargan automáticamente al trabajar en el repo y fijan el listón de diseño e interacción. **Toda pantalla pasa por ellas antes de darse por terminada** (ver Definition of Done en el plan maestro).

| Skill | Origen | Licencia | Para qué |
|---|---|---|---|
| `impeccable` | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | Apache-2.0 | Lenguaje de diseño y comandos de dirección (`polish`, `audit`, `critique`, `distill`, `typeset`, `colorize`…). Referencias de tipografía, color, movimiento, espaciado, interacción y escritura de UI |
| `taste` | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) | MIT | Evita el resultado genérico: mejora layout, tipografía, motion y espaciado |
| `emil-design-eng` | [emilkowalski/skills](https://github.com/emilkowalski/skills) | MIT | Criterio de design engineering |
| `animation-vocabulary` | ídem | MIT | Vocabulario común de animación |
| `find-animation-opportunities` | ídem | MIT | Detecta dónde el movimiento aporta |
| `improve-animations` | ídem | MIT | Audita y mejora animaciones existentes |
| `review-animations` | ídem | MIT | Revisión estricta de animaciones |

## Cómo se usan aquí

- **Landing (E3)** — es donde más pesan. Antes de cerrar cualquier ticket de landing: pasar `impeccable` (`audit` y luego `polish`) y `review-animations`.
- **Panel (E5–E9)** — `taste` e `impeccable` sobre las vistas densas (tablas, formularios) para que no queden genéricas.
- **Tokens (BODA-02)** — las referencias de color y tipografía de `impeccable` orientan los valores primitivos. La **estructura** de tokens la manda el §2.2 del plan maestro: si algo choca, gana el plan.
- **Movimiento** — las skills de Emil Kowalski marcan el criterio, pero duraciones y curvas siguen siendo tokens (`--duration-*`, `--ease-*`). Ninguna skill justifica hardcodear un valor.

## Actualización

Se copiaron con `git clone --depth 1` y viven versionadas en el repo para que el criterio no cambie bajo los pies a mitad de proyecto. Para actualizar, volver a clonar el origen y revisar el diff.

Cada carpeta conserva la licencia de su origen.
