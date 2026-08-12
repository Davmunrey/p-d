import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

/**
 * La regla 1 del proyecto (cero hardcode) se aplica aquí, no en la revisión
 * humana. Si algo de esto salta, el arreglo NUNCA es silenciar la regla: es
 * añadir el token que falta.
 */

/**
 * Utilidades de Tailwind con valor arbitrario: `text-[14px]`, `bg-[#fff]`.
 *
 * Se excluyen los selectores de variante (`data-[activo=true]:`, `aria-[…]`,
 * `has-[…]`, `supports-[…]`, `group-*`, `peer-*`): describen un ESTADO, no un
 * valor de diseño, así que no hay ningún token que pudieran saltarse.
 */
const VARIANTES = "data|aria|supports|has|group|peer|not|in|nth|min|max";
const VALOR_ARBITRARIO = String.raw`(^|\s)(?!(${VARIANTES})-)[a-z-]+-\[[^\]]+\]`;

/** Colores literales escritos a mano en cualquier sitio que no sea un token. */
const COLOR_LITERAL = String.raw`#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(`;

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,

  {
    /**
     * El equivalente en TypeScript de lo que `primitives.css` es en CSS: el
     * único sitio donde hay valores literales, y no escritos a mano sino
     * generados desde el propio sistema de tokens por
     * `scripts/generar-tokens.mjs`. Existe porque las imágenes de Open Graph se
     * pintan sin hoja de estilos y necesitan los valores en crudo.
     *
     * La exención es del fichero generado, no de la regla: cualquier otro
     * fichero de `src/` sigue teniendo prohibido escribir un color.
     */
    name: "boda/tokens-generados",
    files: ["src/config/tokens.generado.ts"],
    rules: { "no-restricted-syntax": "off" },
  },

  {
    name: "boda/cero-hardcode",
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/config/tokens.generado.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: `Literal[value=/${VALOR_ARBITRARIO}/]`,
          message:
            "Valor arbitrario de Tailwind. Usa un token semántico (bg-superficie, text-titulo-1). Si no existe, créalo en src/styles/tokens/.",
        },
        {
          selector: `TemplateElement[value.raw=/${VALOR_ARBITRARIO}/]`,
          message:
            "Valor arbitrario de Tailwind. Usa un token semántico. Si no existe, créalo en src/styles/tokens/.",
        },
        {
          selector: `Literal[value=/${COLOR_LITERAL}/]`,
          message:
            "Color literal. Los colores viven en src/styles/tokens/primitives.css y se consumen por su token semántico.",
        },
        {
          selector: `TemplateElement[value.raw=/${COLOR_LITERAL}/]`,
          message:
            "Color literal. Los colores viven en src/styles/tokens/primitives.css y se consumen por su token semántico.",
        },
      ],
    },
  },

  {
    name: "boda/textos-en-copy",
    files: ["src/app/**/*.tsx", "src/components/**/*.tsx"],
    rules: {
      /**
       * Ningún texto visible se escribe en el JSX: todo sale de
       * content/copy.es.json a través de `t()`.
       *
       * Se permiten cadenas de una sola palabra sin espacios (nombres de
       * token, unidades) para no bloquear cosas como `--{token}`.
       */
      "react/jsx-no-literals": [
        "error",
        {
          noStrings: true,
          allowedStrings: ["--", ".", "·", "—", "/"],
          ignoreProps: true,
        },
      ],
    },
  },

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    // Skills de diseño de terceros: se versionan tal cual llegan del origen.
    ".claude/skills/**",
    /**
     * Copias de trabajo de los agentes. Son clones del repositorio con su
     * propio `.next` compilado dentro, así que revisarlas significa revisar
     * código minificado ajeno: dieciséis mil avisos que sepultan los de
     * verdad. No se versionan (ver `.gitignore`) y no son código del proyecto.
     */
    ".claude/worktrees/**",
    /**
     * La entrega del estudio de marca: las piezas en HTML, sus SVG y el runtime
     * de la herramienta con la que se hicieron. Es material de referencia, no
     * código del proyecto — de ahí salen los valores de `primitives.css`, pero
     * nada de esto se compila ni se despliega.
     *
     * Se versiona tal cual llegó: reformatearlo o "arreglarlo" rompería la
     * única copia fiel del diseño que tenemos.
     */
    "Sistema completo de boda/**",
  ]),
]);

export default eslintConfig;
