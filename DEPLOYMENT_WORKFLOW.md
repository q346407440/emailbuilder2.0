# 部署工作流说明

这份文档对应当前服务器上的“最终落地版”部署工具链。

## 当前线上架构

- 前端静态文件：`Nginx`
- 前端站点根目录：`/var/www/emailbuilder2.0`
- 对外入口：`http://111.230.53.224/`
- Dashboard：`http://111.230.53.224/dashboard`
- 后端 API：Node 服务监听 `3001`
- Nginx 反代：
  - `/api/*` -> `http://127.0.0.1:3001`
  - `/tracking/*` -> `http://127.0.0.1:3001`
- systemd 服务：
  - `nginx`
  - `emailbuilder-prod`

## 项目中的部署脚本

### 在你的电脑本地运行

- `scripts/local/push_to_git.sh`
  - 本地提交并推送到 Git

- `scripts/local/deploy_to_server.sh`
  - 本地打包上传服务器
  - 服务器自动解包、安装依赖、构建、重启
  - 自动清理本地和服务器临时压缩包
  - 自动做基本健康检查

- `scripts/local/release_all.sh`
  - 一键执行：`push_to_git.sh + deploy_to_server.sh`

### 在服务器运行

- `scripts/server/server_export_handoff.sh`
  - 导出当前线上项目、数据库、Nginx/systemd 配置为一个交付包
  - 默认只保留最新 `1` 个 handoff 压缩包

- `scripts/server/server_push_to_git.sh`
  - 服务器当前代码推 Git
  - 仅建议应急使用

## `.deploy.env`

建议把 `.deploy.env.example` 复制为 `.deploy.env` 后再用脚本。

脚本会优先读取：

1. 当前执行目录下的 `.deploy.env`
2. 脚本目录上两级的 `.deploy.env`

示例：

```bash
SERVER_HOST=root@111.230.53.224
SERVER_PROJECT_DIR=/root/emailbuilder2.0
LOCAL_PROJECT_DIR=/path/to/your/local/project
KEEP_LOCAL_ARCHIVES=0
KEEP_ARCHIVES=1
GIT_REMOTE=origin
GIT_BRANCH=main
DEPLOY_DIST_DIR=/var/www/emailbuilder2.0
```

## 日常推荐工作流

### 最推荐：一键发布

在你的电脑本地运行：

```bash
./scripts/local/release_all.sh "你的提交说明"
```

### 只推 Git

在你的电脑本地运行：

```bash
./scripts/local/push_to_git.sh "你的提交说明"
```

### 只部署服务器

在你的电脑本地运行：

```bash
./scripts/local/deploy_to_server.sh
```

### 回收线上状态

在服务器运行：

```bash
./scripts/server/server_export_handoff.sh
```

然后在你本地运行：

```bash
scp root@111.230.53.224:/root/emailbuilder2.0-handoff-*.tar.gz .
```

## 重要说明：服务器不需要主动连接你的本地

日常流程中，推荐方向是：

- 本地 -> 服务器
- 本地 <- 服务器

而不是服务器主动连接本地电脑。

这是因为你的本地电脑通常没有固定公网 IP，且大多处于 NAT 后面。  
所以日常部署只需要：

- 你本地电脑能 `ssh/scp` 到服务器

即可。

## 服务器当前状态

当前服务器上，这份 `/root/emailbuilder2.0` 已经是正式母版：

- 包含生产构建脚本
- 包含生产运行脚本
- 包含发布/导出/Git 同步脚本
- 包含部署工作流文档

## 如果你现在“本地没有，只有服务器这一份”

下一步最推荐你做的是：

1. 先在服务器运行：

```bash
cd /root/emailbuilder2.0
./scripts/server/server_export_handoff.sh
```

2. 然后在你的电脑本地下载交付包：

```bash
scp root@111.230.53.224:/root/emailbuilder2.0-handoff-*.tar.gz .
```

3. 在本地解压后，把 `project/` 作为你的本地工作目录

4. 把 `.deploy.env.example` 复制成 `.deploy.env` 并修改：

```bash
cp .deploy.env.example .deploy.env
```

5. 从那一刻开始，以本地为主进行开发和发布

## 常用命令

```bash
systemctl status nginx
systemctl status emailbuilder-prod
systemctl restart nginx
systemctl restart emailbuilder-prod
journalctl -u emailbuilder-prod -f
journalctl -u nginx -f
```
