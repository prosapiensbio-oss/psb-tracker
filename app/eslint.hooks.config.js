// Jediné pravidlo, ktoré vie zhasnúť CELÝ Kokpit: poradie hookov.
//
// 23. 9. 2026 som vložil useRef/useEffect POD `if (!zdroje) return null;`.
// Prvé vykreslenie malo šesť hookov, druhé deväť, React na to zhodil celú
// appku a Jerry videl „This page didn't load" — nie rozbitú kartu, ale
// prázdnu obrazovku namiesto všetkého.
//
// Pravidlo `react-hooks/rules-of-hooks` to chytí, lenže `bun run lint` hlási
// vyše sto formátovacích výhrad naraz, takže ho nikto nespúšťa a nález
// zapadne. Toto je preto SAMOSTATNÁ, tichá kontrola: buď je ticho, alebo
// sa nenasadzuje.
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config({
  extends: [tseslint.configs.base],
  files: ["src/**/*.{ts,tsx}"],
  plugins: { "react-hooks": reactHooks },
  rules: {
    "react-hooks/rules-of-hooks": "error",
    // Zvyšok tseslint.configs.base je tu len kvôli parseru; jeho výhrady
    // (nepoužité premenné a spol.) sem nepatria, inak sa kontrola zase
    // utopí v šume a prestane sa čítať.
    "@typescript-eslint/no-unused-vars": "off",
  },
});
