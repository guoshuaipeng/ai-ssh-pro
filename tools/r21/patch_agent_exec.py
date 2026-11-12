# -*- coding: utf-8 -*-
"""R21: classify failure before exec emit; attach evidence + retryBudget."""
from pathlib import Path

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")
p = ROOT / "src/main/ai-interactive-agent.ts"
text = p.read_text(encoding="utf-8")

old = """        {
          // 2.3: replay record for this command
          const sum = summarizeExecOutput(execSnapshot, oneLineCmd)
          send(wc, {
            type: 'exec',
            requestId,
            command: oneLineCmd,
            payload: {
              status: execStatusFrom({ writeOk: lastWriteOk === true, exitCode: reported?.exitCode, timedOut: reported?.timedOut, stderr: reported?.stderr }),
              at: execStartedAt,
              durationMs: Date.now() - execStartedAt,
              ...(typeof reported?.exitCode === 'number' ? { exitCode: reported.exitCode } : {}),
              ...(sum.summary ? { summary: sum.summary, outputLines: sum.outputLines } : {}),
              ...(typeof reported?.exitCode !== 'number' && noExit ? { noExit } : {})
            }
          })
        }
        const failure =
          reported || lastWriteOk === false
            ? classifyCommandFailure(oneLineCmd, {
                exitCode: reported?.exitCode,
                stderr: reported?.stderr,
                timedOut: reported?.timedOut,
                timeoutMark: reported?.timeoutMark,
                writeOk: lastWriteOk === true
              })
            : null
        if (failure && requestId) {
          if (lastWriteOk) sessionState.failureStreak += 1
          const nextCount: number = lastFailure && lastFailure.command === failure.command ? lastFailure.count + 1 : 1
          lastFailure = { ...failure, requestId, count: nextCount }
          const failedBudget = observeRetryBudget(nextCount, failure.command)
          lastToolResult = lastToolResult?.trim() ? `${lastToolResult.trim()}\\n${failure.evidence}` : failure.evidence
          rememberNote(sessionState, failure.evidence)
          emitDebug({
            kind: 'execution',
            round: step,
            label: mt('命令失败', 'Command failed'),
            detail: `failed=true kind=${failure.kind} autoRetry=false retryBudget count=${failedBudget.count} cap=${failedBudget.cap} exhausted=${String(failedBudget.exhausted)} nearBudget=${String(failedBudget.nearBudget)}\\n${failure.evidence}`
          })
        } else if (lastWriteOk && lastFailure && lastFailure.command === oneLineCmd) {
          lastFailure = null
        }
"""

# Note: the file uses real newlines in template strings, not escaped. Read exact segment.
start = text.find("        {\n          // 2.3: replay record for this command")
if start < 0:
    raise SystemExit("start marker not found")
end = text.find("        } else if (lastWriteOk && lastFailure && lastFailure.command === oneLineCmd) {\n          lastFailure = null\n        }", start)
if end < 0:
    raise SystemExit("end marker not found")
end = text.find("\n", end + len("        } else if (lastWriteOk && lastFailure && lastFailure.command === oneLineCmd) {\n          lastFailure = null\n        }"))
# include the else-if block through its closing brace line
end_block = text.find("        } else if (lastWriteOk && lastFailure && lastFailure.command === oneLineCmd) {", start)
if end_block < 0:
    raise SystemExit("else-if not found")
# find closing of that else-if: next line after lastFailure = null
close = text.find("\n        }\n", end_block)
if close < 0:
    raise SystemExit("close not found")
close = close + len("\n        }")

new = """        {
          // 2.3 + R21: classify failure before emit so the reply card can pin evidence (S27).
          const sum = summarizeExecOutput(execSnapshot, oneLineCmd)
          const failure =
            reported || lastWriteOk === false
              ? classifyCommandFailure(oneLineCmd, {
                  exitCode: reported?.exitCode,
                  stderr: reported?.stderr,
                  timedOut: reported?.timedOut,
                  timeoutMark: reported?.timeoutMark,
                  writeOk: lastWriteOk === true
                })
              : null
          let failedBudget = failure ? observeRetryBudget(1, failure.command) : null
          if (failure && requestId) {
            if (lastWriteOk) sessionState.failureStreak += 1
            const nextCount: number = lastFailure && lastFailure.command === failure.command ? lastFailure.count + 1 : 1
            lastFailure = { ...failure, requestId, count: nextCount }
            failedBudget = observeRetryBudget(nextCount, failure.command)
            lastToolResult = lastToolResult?.trim() ? `${lastToolResult.trim()}\\n${failure.evidence}` : failure.evidence
            rememberNote(sessionState, failure.evidence)
            emitDebug({
              kind: 'execution',
              round: step,
              label: mt('命令失败', 'Command failed'),
              detail: `failed=true kind=${failure.kind} autoRetry=false retryBudget count=${failedBudget.count} cap=${failedBudget.cap} exhausted=${String(failedBudget.exhausted)} nearBudget=${String(failedBudget.nearBudget)}\\n${failure.evidence}`
            })
          } else if (lastWriteOk && lastFailure && lastFailure.command === oneLineCmd) {
            lastFailure = null
          }
          send(wc, {
            type: 'exec',
            requestId,
            command: oneLineCmd,
            payload: {
              status: execStatusFrom({ writeOk: lastWriteOk === true, exitCode: reported?.exitCode, timedOut: reported?.timedOut, stderr: reported?.stderr }),
              at: execStartedAt,
              durationMs: Date.now() - execStartedAt,
              ...(typeof reported?.exitCode === 'number' ? { exitCode: reported.exitCode } : {}),
              ...(sum.summary ? { summary: sum.summary, outputLines: sum.outputLines } : {}),
              ...(typeof reported?.exitCode !== 'number' && noExit ? { noExit } : {}),
              ...(failure
                ? {
                    failureKind: failure.kind,
                    evidence: failure.evidence,
                    ...(failedBudget
                      ? {
                          retryBudget: {
                            count: failedBudget.count,
                            cap: failedBudget.cap,
                            exhausted: failedBudget.exhausted
                          }
                        }
                      : {})
                  }
                : {})
            }
          })
        }
"""

# Fix accidental double-escaping of \\n in template - use real JS template newlines
new = new.replace("`${lastToolResult.trim()}\\\\n${failure.evidence}`", "`${lastToolResult.trim()}\\n${failure.evidence}`")
new = new.replace(
    "detail: `failed=true kind=${failure.kind} autoRetry=false retryBudget count=${failedBudget.count} cap=${failedBudget.cap} exhausted=${String(failedBudget.exhausted)} nearBudget=${String(failedBudget.nearBudget)}\\\\n${failure.evidence}`",
    "detail: `failed=true kind=${failure.kind} autoRetry=false retryBudget count=${failedBudget.count} cap=${failedBudget.cap} exhausted=${String(failedBudget.exhausted)} nearBudget=${String(failedBudget.nearBudget)}\\n${failure.evidence}`",
)

text2 = text[:start] + new + text[close:]
if "failureKind: failure.kind" not in text2:
    raise SystemExit("patch failed to insert failureKind")
p.write_text(text2, encoding="utf-8")
print("agent patched", start, close)
