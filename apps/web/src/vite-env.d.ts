/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_MODE?: 'local' | 'forwarded';
  readonly VITE_FORWARDED_API_URL?: string;
  readonly VITE_LOCAL_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
