/// <reference types="vite/client" />

declare const __APP_ID__: string

// Vite raw imports for markdown files
declare module '*.md?raw' {
  const content: string
  export default content
}
