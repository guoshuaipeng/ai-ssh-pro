# D23 主机指纹确认流程（2026-10-20，第 14 轮）

## 需求
首次连接与指纹变更时，用户能看懂、能核对、不会误点信任。

## 现状
HostKeyConfirmModal 已有：拒绝 / 仅本次 / 信任、变更警告与旧指纹、known_hosts 查询。trustHostKey 以 host:port 为键覆盖旧条目（无残留）。

## 缺口与设计
1. 指纹无算法类型 → main 从密钥 wire blob 解析 `keyType`（shared/host-key-info.ts hostKeyType），弹窗显示 ED25519/RSA/ECDSA-n 标签。
2. 无核对方法 → 显示服务器端命令 `ssh-keygen -lf /etc/ssh/ssh_host_<type>_key.pub`，指纹与命令均可一键复制。
3. 指纹变更误信任 → 变更时须勾选"我已通过其他途径核实"才可点"仅本次/信任"（canTrust）；拒绝始终可点。
4. 120s 超时后弹窗残留、按钮无效 → main 发 `ssh:hostKeyExpired`，渲染端关闭当前弹窗（或从队列移除）并提示可重新连接。

## 不做
不按主机环境（生产）区分策略：变更勾选已覆盖所有主机；不做倒计时显示（减少干扰）。
