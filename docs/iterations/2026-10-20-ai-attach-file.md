# D39 SFTP 文件附带给 AI（脱敏、限大小、用户确认后发送）（2026-10-20 第 20 轮）

## 现状
- AI 对话可以附带终端输出，终端选中文字也能「问 AI」（填进输入框，不自动发送）。
- 缺口：排错时常要看配置文件，只能手动复制粘贴。

## 方案
- SFTP 远端文件右键「问 AI（附带此文件）」。
- 先检查：
  - 文件名像密钥或凭据的（id_*、*.pem/key/p12/pfx、.env*、shadow、.netrc、credentials 等）直接拒绝。
  - 二进制文件拒绝；超过 2 MB 的提示先截取需要的部分。
- 读取上限 32 KB，超出部分截断并注明。
- 脱敏：
  - password/secret/token/api_key 这类 key=value 或 key: value 的值替换成 ••••。
  - 再套用 redactAuditText 处理 Bearer、AKIA、私钥块等。
  - 提示里写明隐藏了几处。
- 内容走已有的 requestAskWithContext，只填进当前主机标签的 AI 输入框，不自动发送。用户看过内容、自己按发送，就是确认这一步。
