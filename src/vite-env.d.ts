/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENTRA_CLIENT_ID?: string;
  readonly VITE_ENTRA_TENANT_ID?: string;
  readonly VITE_ENTRA_API_SCOPE?: string;
  readonly VITE_API_AUTH_REQUIRED?: string;
  readonly VITE_E2E_AUTH_BYPASS?: string;
  readonly VITE_PIPELINE_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
