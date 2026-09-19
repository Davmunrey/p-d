import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Tests unitarios y de integración.
 *
 * Los E2E son de Playwright y viven en `tests/e2e`: se excluyen aquí para que
 * cada corredor ejecute solo lo suyo.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}", "tests/unidad/**/*.test.{ts,tsx}"],
    exclude: ["tests/e2e/**", "node_modules/**"],

    /*
      SIN TESTS, EL RUN FALLA. Estaba en `true`, que es el valor cómodo de
      cuando un proyecto empieza vacío y hace ya mucho que no es el caso.
      Mientras siga puesto, el día que un `include` deje de casar —una carpeta
      renombrada, un glob tocado— `npm test` sale con cero, en verde, sin haber
      probado nada. Y un CI verde que no prueba nada es peor que uno rojo:
      afirma lo que no sabe.
    */
    passWithNoTests: false,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
