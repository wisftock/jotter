import React from 'react'
import ReactDOM from 'react-dom/client'
import * as monaco from 'monaco-editor'
import {
  javascriptDefaults,
  typescriptDefaults,
  ScriptTarget,
  ModuleResolutionKind,
  ModuleKind,
  JsxEmit
} from 'monaco-editor/language/typescript/monaco.contribution'
import { loader } from '@monaco-editor/react'
import editorWorker from 'monaco-editor/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/language/typescript/ts.worker?worker'
import App from './App'
import './styles.css'

interface MonacoEnvironmentShape {
  getWorker: (moduleId: string, label: string) => Worker
}

;(self as unknown as { MonacoEnvironment: MonacoEnvironmentShape }).MonacoEnvironment = {
  getWorker(_moduleId: string, label: string): Worker {
    switch (label) {
      case 'json':
        return new jsonWorker()
      case 'css':
      case 'scss':
      case 'less':
        return new cssWorker()
      case 'html':
      case 'handlebars':
      case 'razor':
        return new htmlWorker()
      case 'typescript':
      case 'javascript':
        return new tsWorker()
      default:
        return new editorWorker()
    }
  }
}

loader.config({ monaco })

javascriptDefaults.setEagerModelSync(true)
javascriptDefaults.setDiagnosticsOptions({
  // Semantic checks are off because npm packages are resolved at runtime,
  // not known to the Monaco language service.
  noSemanticValidation: true,
  noSyntaxValidation: false
})
javascriptDefaults.setCompilerOptions({
  target: ScriptTarget.ES2022,
  allowNonTsExtensions: true,
  allowJs: true,
  jsx: JsxEmit.ReactJSX,
  jsxImportSource: 'react',
  lib: ['es2022', 'dom']
})
typescriptDefaults.setEagerModelSync(true)
typescriptDefaults.setCompilerOptions({
  target: ScriptTarget.ES2022,
  moduleResolution: ModuleResolutionKind.NodeJs,
  module: ModuleKind.ESNext,
  allowNonTsExtensions: true,
  jsx: JsxEmit.ReactJSX,
  jsxImportSource: 'react',
  lib: ['es2022', 'dom']
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
