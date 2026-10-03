declare module 'monaco-editor/language/typescript/monaco.contribution' {
  interface MonacoLanguageServiceDefaults {
    setEagerModelSync: (value: boolean) => void
    setDiagnosticsOptions: (options: Record<string, unknown>) => void
    setCompilerOptions: (options: Record<string, unknown>) => void
  }

  export const javascriptDefaults: MonacoLanguageServiceDefaults
  export const typescriptDefaults: MonacoLanguageServiceDefaults
  export const ScriptTarget: Record<string, number>
  export const ModuleResolutionKind: Record<string, number>
  export const ModuleKind: Record<string, number>
  export const JsxEmit: Record<string, number>
}
