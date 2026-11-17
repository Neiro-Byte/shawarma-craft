import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { kitchenApi } from './server/kitchenApi';
export default defineConfig({plugins:[react(),tailwindcss(),kitchenApi()],build:{emptyOutDir:false,chunkSizeWarningLimit:1500}});
