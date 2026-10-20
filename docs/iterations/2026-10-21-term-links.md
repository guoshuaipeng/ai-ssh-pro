# D70 终端链接可点击

PM 复查日常路径：终端输出里的 http(s) 链接（部署地址、CI 日志、文档、报错提示里的 URL）每天都会碰到。
核对：没有 WebLinksAddon，也没有 registerLinkProvider，链接只能手动复制 → 真实缺口。
设计：
- 用 xterm 自带的 registerLinkProvider，不新增依赖。shared/term-links 的 findUrls 负责识别链接，并去掉结尾的标点和不成对的右括号。
- 链接显示下划线和手形指针。按住 Ctrl（Mac 上为 Cmd）点击，通过已有的 app:openExternal 在浏览器打开；主进程只放行 http/https。
- 普通点击不打开链接，避免误点；只提示一次「按住 Ctrl 再点击」，30 秒内不重复提示。
- 限制：跨行折叠的长链接只识别当前这一行。
