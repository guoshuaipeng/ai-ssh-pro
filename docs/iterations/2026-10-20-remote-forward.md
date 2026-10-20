# B3 远程端口转发 -R（2026-10-20，周期 2）

路线图 3.1 · P0

## 1. 需求（PM）

**问题**：现在只有本地转发 -L（本机监听 → 远端服务）。常见反向场景做不了：让服务器访问本机的开发服务（webhook 回调、本地调试 API、给内网机临时提供 yum/pip 镜像）。用户只能另开终端执行 `ssh -R`，断线后还要自己重建。

**用户故事**：作为运维/开发，我在「端口转发」面板选择会话和「远程 -R」，填入远端监听端口和本机目标，点添加后服务器上的 `127.0.0.1:端口` 就能访问到我本机的服务。断线重连后转发自动恢复。只读主机不允许我在服务器上开监听端口，并告诉我原因。

**验收标准**
1. 面板有方向切换「本地 -L / 远程 -R」。切到 -R 后，字段依次为：远端监听地址（默认 127.0.0.1）、远端监听端口（留空时由服务器分配）、本地目标主机（默认 127.0.0.1）、本地目标端口。
2. 添加成功后列表显示方向徽标 -R，「本地」列显示目标地址，「远端」列显示服务器实际监听的地址:端口；监听端口为 0 时显示服务器分配的端口。连接数和流量与 -L 一样统计。
3. 服务器拒绝时（端口被占用、AllowTcpForwarding no、非回环地址需要 GatewayPorts）显示可读原因；同一会话里重复的远端端口在请求服务器前就被拒绝，不影响已有绑定。本地目标没有监听时，行内 lastError 显示「本地 x:y 未在监听」。
4. 只读保护（配置只读或会话只读，且未临时解锁）时，-R 选项仍可点选，但下方显示原因，「添加转发」按钮禁用并带 tooltip。-L 不受影响，因为它不改动服务器。
5. 远端监听地址不是回环地址时显示黄色提示：本机服务会暴露给服务器所在网络。
6. 断线重连：面板手动添加的转发（-L 和 -R）在重连成功后自动恢复到新会话。会话配置里的转发仍由 connect 建立，不重复。重连时如果主机处于只读，-R 跳过并 toast 提示，-L 照常恢复。
7. 审计：每次成功添加 -R 写一条 `forward.remote` 审计记录，detail 为 `-R bind:port → host:port`。
8. 会话配置的 `forwards[]` 支持 `direction: 'R'`，数据格式向后兼容（缺省为 L）。

## 2. 交互 / UI

### 布局
```
[ 本地 -L | 远程 -R ]                   ← 分段切换（主题按钮，非原生控件）
提示文案（随方向切换）
会话▾  远端监听地址  远端监听端口  本地目标主机  本地目标端口  [添加转发]
⚠ 只读主机不允许远程转发：-R 会在服务器上打开监听端口。解锁只读后再添加。   ← 受限原因
```
- 分段控件：高度 24px，圆角 `--radius-sm`，选中项用 `--color-accent-muted` 底和 `--color-text`，未选中用 `--color-text-secondary`；`role="radiogroup"`，每项 `role="radio" aria-checked`。
- 提示条 `.pf-note`：`--fs-xs`，间距 `--space-1`/`--space-2`；警告用 `--color-warn` 字色和 `--color-warn-muted` 底。
- 表格新增「方向」列，徽标复用 `.pf-badge`；-R 的「复制地址」复制服务器侧地址。

### 状态
| 状态 | 表现 |
|---|---|
| 空 | 沿用 EmptyState（pf4.fwdTitle/Desc）；没有会话时主按钮是「选择主机」 |
| 错误 | ErrorNotice 显示服务器拒绝原因或校验错误（字段名 + 值） |
| 禁用 | 只读时 -R 的「添加转发」禁用，tooltip 与提示条说明原因；分段控件始终可点 |
| 无 loading | 添加期间只把按钮置为 busy 禁用，不出现 spinner |

### 文案（zh / en）
- `pf.dirL` 本地 -L / Local -L
- `pf.dirR` 远程 -R / Remote -R
- `pf.direction` 方向 / Direction
- `pfR.hint` 在服务器上监听端口，经本会话转回本机的目标地址。服务器访问 127.0.0.1:端口 即可访问本机服务。断线重连后自动恢复。 / Listens on the server and tunnels connections back to a target on this computer. The server reaches your service at 127.0.0.1:port. Restored after a reconnect.
- `pfR.bindHost` 远端监听地址 / Remote listen address
- `pfR.bindPort` 远端监听端口 / Remote listen port
- `pfR.localHost` 本地目标主机 / Local target host
- `pfR.localPort` 本地目标端口 / Local target port
- `pfR.blockedReadonly` 只读主机不允许远程转发：-R 会在服务器上打开监听端口。解锁只读后再添加。 / Remote forwarding is off on read-only hosts: -R opens a listening port on the server. Unlock read-only first.
- `pfR.exposeWarn` 监听地址不是回环地址：本机服务将暴露给服务器所在网络（需 sshd 开启 GatewayPorts）。 / Not a loopback address: your local service will be reachable from the server's network (requires GatewayPorts on sshd).
- `pfR.restored` 已恢复 {n} 条端口转发 / Restored {n} port forwards
- `pfR.skippedReadonly` 只读主机：{n} 条远程转发未恢复 / Read-only host: {n} remote forwards not restored

## 3. 实现要点
- `src/shared/remote-forward.ts`：`parseRemoteSpec`、`remoteForwardBlockReason`、`exposesBeyondLoopback`、`remoteForwardLabel`、`CarryStore`（TTL 30 min，最多 50 个会话，一次性取出）。
- `forward-manager.ts`：`startTrackedForward` 按 `direction` 分发；-R 用 `client.forwardIn` + 每个 client 一个 `tcp connection` 分发器（按端口）；停止时 `unforwardIn`；`stopSessionForwards` 把手动规则存入 CarryStore；`restoreForwards(from, to, client, allowRemote)`。
- IPC `workspace:forwards:restore`；`reconnectTab` 成功后调用，`allowRemote = !readonly`。
- 只读判定在渲染层（与 S4 一致，客户端侧）。

## 4. 风险 / 未验证
- 未在真实 sshd 上端到端验证；单测用假 client + 本机真实 TCP echo 覆盖数据路径。
- 服务器端 `GatewayPorts`、`AllowTcpForwarding`、`PermitListen` 的拒绝信息只能统一归类为「服务器拒绝」。
