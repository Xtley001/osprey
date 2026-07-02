/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HL_REST_URL: string;
  readonly VITE_HL_WS_URL: string;
  readonly VITE_HL_TESTNET_REST: string;
  readonly VITE_HL_TESTNET_WS: string;
  readonly VITE_ENABLE_REAL_TRADING: string;
  readonly VITE_ENABLE_TESTNET: string;
  readonly VITE_ENABLE_AGENT_KEYS: string;
  readonly VITE_WALLETCONNECT_PROJECT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
