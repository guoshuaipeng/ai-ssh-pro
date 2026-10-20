# D93 SFTP 修改权限

- 需求：部署时经常要给脚本加执行权限（chmod +x），现在只能切到终端手动输入命令。SFTP 浏览是高频路径。
- 去重：grep docs/iterations 与 src（chmod / setstat / 权限…），只有权限列的显示（formatMode），没有修改入口。
- 方案：
  - shared/sftp-perm.ts：permBits、toOctal、toRwx、parseMode。parseMode 支持 755 / 0644 / u+x / go-w / a=r / +x，以及用逗号连接多项。
  - 主进程新增 sftpManager.chmod 和 IPC `sftp:chmod`：用 SFTP chmod 修改，不执行 shell 命令；mode 会做整数和 0–7777 范围校验。
  - 远程文件右键菜单增加「权限…」：
    - 先过 allowRemoteWrite：只读会话或演示主机直接返回；remoteWritesBlocked 时菜单项置灰并给出原因；有 beforeRemoteWrite 时先走它（生产主机提示）。
    - 再输入新权限，默认填当前八进制值；应用前确认「原 755 rwxr-xr-x → 新 …」，修改后刷新目录。
- 限制：一次只改一个文件，不递归。
