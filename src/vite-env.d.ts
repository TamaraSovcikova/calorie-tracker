/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_FITBIT_CLIENT_ID?: string;
  readonly VITE_GOOGLE_CLIENT_SECRET?: string;
  readonly VITE_OFF_APP_NAME?: string;
  readonly VITE_OFF_APP_VERSION?: string;
  /** Optional bundled USDA FoodData Central key — search works for all users. */
  readonly VITE_USDA_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Build-time app version, injected from package.json by Vite. */
declare const __APP_VERSION__: string;
