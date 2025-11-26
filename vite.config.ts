import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const manualChunks = (id: string) => {
  if (id.includes('node_modules/three/examples')) {
    return 'three-examples'
  }
  if (id.includes('node_modules/three')) {
    return 'three-core'
  }
  if (id.includes('node_modules/react-dom')) {
    return 'react-dom'
  }
  if (id.includes('node_modules/react-router-dom')) {
    return 'react-router'
  }
  if (id.includes('node_modules/react')) {
    return 'react-base'
  }
  return undefined
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
})
