import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    sourcemap: false, // Don't expose source maps in production
    rollupOptions: {
      // @walletconnect/ethereum-provider is an optional peer dep loaded at
      // runtime only when the user clicks WalletConnect.  Mark it external so
      // Rollup doesn't fail the build when it isn't installed.
      external: ['@walletconnect/ethereum-provider'],
    },
  },
})
