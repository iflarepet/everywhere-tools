import { cpSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
const target = resolve('public/excalidraw/fonts')
mkdirSync(target, { recursive: true })
cpSync(resolve('node_modules/@excalidraw/excalidraw/dist/prod/fonts'), target, { recursive: true })
console.log('Diagram fonts prepared locally.')
