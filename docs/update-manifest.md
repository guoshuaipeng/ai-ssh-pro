# 官网更新清单

客户端检查更新时**优先**请求：

`https://guoshuaipeng.github.io/ai-ssh-pro/update.json`

失败（超时、非 200、无法解析版本）再回退 GitHub Releases API：

`https://api.github.com/repos/guoshuaipeng/ai-ssh-pro/releases/latest`

Gitee Releases API 不再使用。本仓库示例文件：[`docs/website/update.json`](./website/update.json)，发布到 GitHub Pages 根路径即可。

## 字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `schemaVersion` | 建议 | 目前为 `1` |
| `version` | 是 | 语义化版本，可带或不带 `v` 前缀 |
| `name` | 否 | 发布标题 |
| `notes` | 是 | 发布说明，Markdown。客户端取以 `-` / `*` / `•` 开头的前 5 条 |
| `publishedAt` | 否 | ISO 时间 |
| `htmlUrl` | 否 | 发布页；缺省用官网首页 |
| `downloads.<platform>` | 是 | `win32` / `darwin` / `linux`（也接受 `win` / `mac` / `windows`） |
| `downloads.<platform>.github` | 是 | 该平台 GitHub 资源直链 |
| `downloads.<platform>.pan123` | 建议 | 该平台 123 云盘分享链接 |
| `pan123.url` | 建议 | 全局 123 云盘分享（各平台未单独填写时使用） |
| `pan123.code` | 否 | 提取码（若有） |

也接受 GitHub Release JSON（`tag_name` + `assets`），供自定义清单或回退源使用。

## 最小示例

```json
{
  "schemaVersion": 1,
  "version": "0.7.0",
  "name": "AI-SSH-Pro 0.7.0",
  "notes": "- 官网清单优先\n- 国内可走 123 云盘",
  "htmlUrl": "https://github.com/guoshuaipeng/ai-ssh-pro/releases/tag/v0.7.0",
  "downloads": {
    "win32": {
      "github": "https://github.com/guoshuaipeng/ai-ssh-pro/releases/download/v0.7.0/AI-SSH-Pro-0.7.0-win-x64.exe",
      "pan123": "https://www.123pan.com/s/REPLACE"
    },
    "darwin": {
      "github": "https://github.com/guoshuaipeng/ai-ssh-pro/releases/download/v0.7.0/AI-SSH-Pro-0.7.0-mac-x64.dmg",
      "pan123": "https://www.123pan.com/s/REPLACE"
    },
    "linux": {
      "github": "https://github.com/guoshuaipeng/ai-ssh-pro/releases/download/v0.7.0/AI-SSH-Pro-0.7.0-linux-x64.AppImage",
      "pan123": "https://www.123pan.com/s/REPLACE"
    }
  },
  "pan123": {
    "url": "https://www.123pan.com/s/REPLACE",
    "code": ""
  }
}
```

发布流程见 [`.github/RELEASE_TEMPLATE.md`](../.github/RELEASE_TEMPLATE.md)。不做代码签名。
