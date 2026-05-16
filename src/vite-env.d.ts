/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_FITBIT_CLIENT_ID?: string;
  readonly VITE_GOOGLE_CLIENT_SECRET?: string;
  readonly VITE_OFF_APP_NAME?: string;
  readonly VITE_OFF_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
