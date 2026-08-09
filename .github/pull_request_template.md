## Qué cambia

<!-- Una frase. Si no cabe en una, probablemente sean dos PR. -->

Closes #

## Cómo probarlo en el preview

<!-- Los pasos exactos. Quien revisa no debería tener que adivinar dónde mirar. -->

1.

## Definition of Done

- [ ] Funciona contra la BBDD real, sin mocks ni datos de ejemplo incrustados
- [ ] Cero hardcode: colores y espaciados son tokens, los textos salen de `content/copy.es.json`, los datos de la boda de la BBDD y los límites de `src/config/constants.ts`
- [ ] Test E2E incluido: camino feliz **y** al menos un caso de error
- [ ] CI verde entero: typecheck, lint, stylelint, formato, unitarios, migraciones y E2E
- [ ] Responsive en móvil, tablet y escritorio
- [ ] Accesible: teclado, foco visible, contraste AA, `prefers-reduced-motion`
- [ ] Pasado por las skills de diseño
- [ ] Revisado en el deploy preview

## Base de datos

- [ ] No la toca
- [ ] Trae migración **y** su SQL de rollback en `supabase/migrations/rollback/`

## Documentación

- [ ] No hace falta
- [ ] `docs/PLAN-MAESTRO.md` actualizado en esta misma PR
