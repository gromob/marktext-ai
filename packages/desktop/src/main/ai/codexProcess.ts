import type { ChildProcessWithoutNullStreams } from 'node:child_process'

export function terminateCodexProcess(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals): void {
  // A CLI launcher may own a native child; both belong to this request.
  try {
    if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal)
    else child.kill(signal)
  } catch {
    child.kill(signal)
  }
}
