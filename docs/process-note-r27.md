# Process note — Round 27 (every-3 visual audit)

- Cadence held: R24 → R27 full-page AI audit; next R30.
- Reused declarative shot matrices (R14–R26) + code review instead of Tauri rebuild for acceptance; Electron harness still the default evidence channel.
- Abstraction reminder: deep-link screenshot states need **seeded data** (audit row / memory / failure pin) or an intentional empty expect — never claim a hit from an empty store.
- Wiring debt: R26 tests were green locally but missing from `package.json` test:parts until this round — every new `test-rXX` should land in test:parts in the same commit.
