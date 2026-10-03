import type { RunError, RunnerLog, RunResult } from '../../shared/types'

export interface BrowserHandlers {
  onLog: (log: RunnerLog) => void
  onError: (error: RunError) => void
  onResult: (result: RunResult) => void
}

const BOOTSTRAP = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>html, body { margin: 0; padding: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }</style>
</head>
<body>
<div id="root"></div>
<script>
(function () {
  function send(msg) {
    try { parent.postMessage(Object.assign({ source: 'wisfjs-browser' }, msg), '*') } catch (e) {}
  }
  function stringify(value) {
    var seen = new WeakSet();
    try {
      return JSON.stringify(value, function (k, v) {
        if (typeof v === 'object' && v !== null) {
          if (seen.has(v)) return '[Circular]';
          seen.add(v);
        }
        return v;
      }, 2);
    } catch (e) {
      return String(value);
    }
  }
  function fmt(v) {
    if (typeof v === 'string') return v;
    if (v === undefined) return 'undefined';
    if (v === null) return 'null';
    if (typeof v === 'function') return v.toString();
    if (v instanceof Error) return v.stack || (v.name + ': ' + v.message);
    if (typeof v === 'object') return stringify(v);
    return String(v);
  }
  function serializeError(err) {
    if (err instanceof Error) {
      return { name: err.name, message: err.message, stack: err.stack };
    }
    return { name: 'Error', message: fmt(err) };
  }
  var levels = ['log', 'info', 'warn', 'error', 'debug'];
  var con = {};
  levels.forEach(function (level) {
    con[level] = function () {
      var args = Array.prototype.slice.call(arguments);
      send({ type: 'log', level: level, text: args.map(fmt).join(' ') });
    };
  });
  con.dir = con.log;
  window.console = con;
  window.onerror = function (message, source, line, col, err) {
    send({ type: 'error', error: serializeError(err || new Error(message)) });
    return true;
  };
  window.onunhandledrejection = function (event) {
    send({ type: 'error', error: serializeError(event.reason) });
  };
  globalThis.__WISF_LOG__ = function (value, label, auto) {
    if (auto && value === undefined) return;
    send({ type: 'log', level: 'result', text: fmt(value), label: label });
  };
  function reportHeight() {
    try {
      // Measure the real content, not the frame viewport (which is at least
      // the current height, preventing the view from ever shrinking).
      var max = 0;
      var children = document.body.children;
      for (var i = 0; i < children.length; i++) {
        var tag = children[i].tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE') continue;
        var rect = children[i].getBoundingClientRect();
        if (rect.bottom > max) max = rect.bottom;
      }
      if (max <= 0) {
        max = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      }
      send({ type: 'resize', height: Math.ceil(max) });
    } catch (e) {}
  }
  function execute(code) {
    globalThis.__WISF_RESULT__ = undefined;
    try { window.scrollTo(0, 0); } catch (e) {}
    try {
      if (/\\bawait\\b/.test(code)) {
        var fn = new Function('"use strict"; return (async function () {\\n' + code + '\\n})()');
        Promise.resolve(fn()).then(function (v) {
          var result = globalThis.__WISF_RESULT__;
          if (result === undefined) result = v;
          if (result !== undefined) send({ type: 'log', level: 'result', text: fmt(result) });
          send({ type: 'done' });
          reportHeight();
        }).catch(function (err) {
          send({ type: 'error', error: serializeError(err) });
          send({ type: 'done' });
          reportHeight();
        });
      } else {
        var value = (0, eval)(code);
        var result = globalThis.__WISF_RESULT__;
        if (result === undefined) result = value;
        if (result !== undefined) send({ type: 'log', level: 'result', text: fmt(result) });
        send({ type: 'done' });
        reportHeight();
      }
    } catch (err) {
      send({ type: 'error', error: serializeError(err) });
      send({ type: 'done' });
      reportHeight();
    }
  }
  window.addEventListener('load', reportHeight);
  try {
    new MutationObserver(reportHeight).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true
    });
    new ResizeObserver(reportHeight).observe(document.body);
  } catch (e) {}
  setTimeout(reportHeight, 0);
  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || data.source !== 'wisfjs-host') return;
    execute(data.code);
  });
})();
</script>
</body>
</html>`

export class BrowserRunner {
  private iframe: HTMLIFrameElement
  private handlers: BrowserHandlers
  private startedAt = 0
  private disposed = false
  private lastHeight = -1

  constructor(handlers: BrowserHandlers) {
    this.handlers = handlers
    this.iframe = document.createElement('iframe')
    this.iframe.setAttribute('sandbox', 'allow-scripts')
    this.iframe.setAttribute('title', 'browser-runtime')
    this.iframe.className = 'webview-frame'
    window.addEventListener('message', this.onMessage)

    const slot = document.getElementById('wisfjs-webview')
    ;(slot ?? document.body).appendChild(this.iframe)
  }

  private onMessage = (event: MessageEvent): void => {
    if (event.source !== this.iframe.contentWindow) return
    const data = event.data as {
      source?: string
      type?: string
      level?: string
      text?: string
      label?: string
      height?: number
      error?: RunError
    }
    if (!data || data.source !== 'wisfjs-browser') return
    if (data.type === 'resize') {
      this.applyHeight(typeof data.height === 'number' ? data.height : 0)
      return
    }
    if (data.type === 'log') {
      this.handlers.onLog({
        level: (data.level as RunnerLog['level']) || 'log',
        text: data.text ?? '',
        label: data.label
      })
    } else if (data.type === 'error' && data.error) {
      this.handlers.onError(data.error)
    } else if (data.type === 'done') {
      this.handlers.onResult({
        id: '',
        ok: true,
        duration: Date.now() - this.startedAt
      })
    }
  }

  /** Resizes the web view slot to fit its content, bounded by the panel. */
  private applyHeight(contentHeight: number): void {
    const slot = document.getElementById('wisfjs-webview')
    if (!slot) return
    const parent = slot.parentElement
    const max = parent ? Math.max(120, parent.clientHeight - 44) : 480
    const height = Math.max(80, Math.min(Math.ceil(contentHeight) + 2, max))
    if (height === this.lastHeight) return
    this.lastHeight = height
    slot.style.height = `${height}px`
  }

  /**
   * Runs an already-bundled script inside a freshly reloaded web view. The
   * frame is reloaded so the DOM, timers and listeners of the previous run are
   * discarded (prevents duplicated output when re-running). The script is sent
   * only after the new document has finished loading.
   */
  run(bundle: string): void {
    if (this.disposed) return
    this.startedAt = Date.now()
    const onLoad = (): void => {
      this.iframe.removeEventListener('load', onLoad)
      try {
        this.iframe.contentWindow?.postMessage({ source: 'wisfjs-host', code: bundle }, '*')
      } catch {
        /* ignore */
      }
    }
    this.iframe.addEventListener('load', onLoad)
    this.iframe.srcdoc = BOOTSTRAP.replace('</body>', `<!--${Date.now()}--></body>`)
  }

  dispose(): void {
    this.disposed = true
    window.removeEventListener('message', this.onMessage)
    this.iframe.remove()
  }
}
