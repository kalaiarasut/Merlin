/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_AI_SERVICE_URL: string
  readonly VITE_OLLAMA_MODEL?: string
  readonly VITE_GROQ_MODEL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
