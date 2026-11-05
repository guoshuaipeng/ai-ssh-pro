from pathlib import Path

p = Path("scripts/test-core-a-evals.ts")
text = p.read_text(encoding="utf-8")

old_type = """type Fixture = {
  id: string
  title: string
  hostProfile?: { hostId?: string; label?: string; hostname?: string }
  session: { targetSessionId: string; historyKey: string }
  settings?: { autoApproveLowRisk?: boolean; useOpenClaw?: boolean }
  env?: Record<string, string>"""

new_type = """type Fixture = {
  id: string
  title: string
  hostProfile?: { hostId?: string; label?: string; hostname?: string }
  /** Round 28: optional host safety for the chat payload (production / readonly). */
  safetyContext?: {
    production?: boolean
    protection?: 'normal' | 'production' | 'readonly'
    hostPolicy?: 'suggest' | 'ask' | 'auto'
    tempPolicy?: 'suggest' | 'ask' | 'auto'
    elevated?: boolean
    hostId?: string
    hostName?: string
    sessionId?: string
  }
  session: { targetSessionId: string; historyKey: string }
  settings?: { autoApproveLowRisk?: boolean; useOpenClaw?: boolean }
  env?: Record<string, string>"""

if "Round 28: optional host safety" not in text:
    assert old_type in text, "Fixture type anchor missing"
    text = text.replace(old_type, new_type, 1)

old_payload = """        messages: input.history,
        targetSessionId: input.sessionId,
        historyKey: input.fixture.session.historyKey,
        debugTurnId: `${input.fixture.id}-${input.turn.turnId}`,
        hostInventoryId: input.fixture.seedInventory?.hostId || input.fixture.hostProfile?.hostId
      },"""

new_payload = """        messages: input.history,
        targetSessionId: input.sessionId,
        historyKey: input.fixture.session.historyKey,
        debugTurnId: `${input.fixture.id}-${input.turn.turnId}`,
        hostInventoryId: input.fixture.seedInventory?.hostId || input.fixture.hostProfile?.hostId,
        // Round 28: pass fixture safetyContext so production/readonly paths are exercised.
        safetyContext: input.fixture.safetyContext
          ? {
              ...input.fixture.safetyContext,
              hostId: input.fixture.safetyContext.hostId || input.fixture.hostProfile?.hostId,
              hostName:
                input.fixture.safetyContext.hostName ||
                input.fixture.hostProfile?.hostname ||
                input.fixture.hostProfile?.label,
              sessionId: input.fixture.safetyContext.sessionId || input.sessionId
            }
          : undefined
      },"""

if "Round 28: pass fixture safetyContext" not in text:
    assert old_payload in text, "payload anchor missing"
    text = text.replace(old_payload, new_payload, 1)

marker = "* Core-A multi-turn evals. Every `*.json` file in tests/fixtures/core-a/ is a"
if "Round 28: fixture.safetyContext" not in text and marker in text:
    text = text.replace(
        marker,
        marker
        + "\n * Round 28: fixture.safetyContext is forwarded into the chat payload (production/readonly).",
        1,
    )

p.write_text(text, encoding="utf-8")
print("patched test-core-a-evals.ts ok")
