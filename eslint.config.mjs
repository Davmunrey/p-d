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

/**
 * Los atributos que llevan prosa a la pantalla. No es la lista de todos los
 * atributos con texto: es la de los que se han colado alguna vez.
 */
const PROPIEDADES_CON_TEXTO = "/^(placeholder|title|alt|etiqueta|ayuda|label|summary)$/";

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
        /*
          VA EN ESTE MISMO ARRAY Y NO EN UN BLOQUE APARTE, y eso no es manía de
          orden: `no-restricted-syntax` no se suma entre bloques, se sustituye.
          Un segundo bloque con esta regla apuntando a los `.tsx` apagaba las
          cuatro de arriba justo en los ficheros donde más falta hacen, y sin
          decir nada: se probó, y un `bg-[#ff0000]` pasaba sin una queja.

          Lo que mira: `react/jsx-no-literals` lleva `ignoreProps: true` —si no,
          `className`, `type="button"` y cada `href` saltarían— y eso deja un
          agujero del tamaño de un atributo, porque el texto que se ve no
          siempre va entre etiquetas. Un `placeholder`, un `title` o el rótulo
          de un campo son prosa y se leen igual.

          La condición es que el valor lleve un espacio: eso es una frase. Lo
          que no lo lleva —`alt=""` de una imagen decorativa, un `title` de una
          palabra técnica— no es prosa y no se toca.
        */
        {
          selector: `JSXAttribute[name.name=${PROPIEDADES_CON_TEXTO}] > Literal[value=/\\s/]`,
          message:
            'Texto visible en un atributo. Sácalo a content/copy.es.json y pásalo con t("…").',
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
