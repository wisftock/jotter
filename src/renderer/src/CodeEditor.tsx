import { useRef } from 'react'
import MonacoEditor, { type OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import type { Language } from '../../shared/types'

const MONACO_LANGUAGE: Record<Language, string> = {
  javascript: 'javascript',
  typescript: 'typescript',
  jsx: 'javascript',
  tsx: 'typescript'
}

const EXTENSION: Record<Language, string> = {
  javascript: 'js',
  typescript: 'ts',
  jsx: 'jsx',
  tsx: 'tsx'
}

interface EditorProps {
  code: string
  language: Language
  onChange: (value: string) => void
  onRun: () => void
}

export function CodeEditor({ code, language, onChange, onRun }: EditorProps) {
  const runRef = useRef(onRun)
  runRef.current = onRun

  const handleMount: OnMount = (instance, monaco) => {
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current())
    instance.focus()
  }

  return (
    <div className="editor-host">
      <MonacoEditor
        theme="vs-dark"
        language={MONACO_LANGUAGE[language]}
        path={`snippet.${EXTENSION[language]}`}
        value={code}
        onChange={(value) => onChange(value ?? '')}
        onMount={handleMount}
        options={{
          fontSize: 14,
          fontFamily:
            "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
          fontLigatures: true,
          minimap: { enabled: false },
          automaticLayout: true,
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          tabSize: 2,
          renderLineHighlight: 'all',
          padding: { top: 14, bottom: 14 },
          cursorBlinking: 'smooth',
          wordWrap: 'on'
        }}
      />
    </div>
  )
}
