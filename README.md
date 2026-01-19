# 益路同行后端 (ETGY_BACK) - 开发与 AI 上下文指南

> **致 AI Agent**: 本文件作为理解项目架构、代码规范及当前状态的主要上下文来源。

## 1. 项目概览 (Project Overview)

- **项目名称**: `etgy_back`
- **描述**: "益路同行"多端公益教育平台的后端服务，旨在连接儿童（学生）与志愿者。
- **架构模式**: 模块化单体 (Modular Monolith)。
- **当前目标**: MVP (最小可行性产品) 阶段，核心关注视频课程、直播教学与 AI 辅导功能。

## 2. 技术栈 (Technology Stack)

| 组件         | 技术选型              | 上下文 / 理由                                |
| :----------- | :-------------------- | :------------------------------------------- |
| **运行时**   | Node.js (LTS v18/v20) | 异步 IO，庞大的生态系统。                    |
| **开发语言** | TypeScript (v5+)      | 类型安全，提高代码可维护性。                 |
| **Web 框架** | Express.js (v5)       | 路由管理，丰富的中间件生态。                 |
| **数据库**   | MySQL 8.0+            | 关系型数据存储 (用户, 订单, 元数据)。        |
| **ORM**      | Prisma                | Schema 优先，强大的类型推导。                |
| **缓存**     | Redis                 | Session/Token 黑名单，高频计数 (点赞/播放)。 |
| **对象存储** | OSS/COS               | 视频文件，图片存储 (对象存储)。              |
| **实时通信** | TRTC / Agora (声网)   | 直播基础设施 (信令/Token 生成)。             |
| **AI 服务**  | 豆包 / OpenAI         | AI 辅导 API 接入。                           |

## 3. 架构与目录结构 (Architecture & Directory Structure)

本项目遵循 **分层模块化架构 (Layered Modular Architecture)**。

### 3.1 目录映射 (`/src`)

- **`app.ts`**: Express 应用配置，中间件装载。
- **`server.ts`**: 服务入口文件 (HTTP 监听)。
- **`config/`**: 环境变量 (通过 `dotenv`)，数据库连接配置。
- **`controllers/`**: HTTP 请求处理器 (参数解析 -> 调用 Service -> 响应格式化)。
- **`services/`**: 核心业务逻辑 (复用性强，与 HTTP 层解耦)。
- **`routes/`**: API 路由定义 (按模块分组)。
- **`middlewares/`**: 全局与路由级中间件 (鉴权, 错误处理, 日志)。
- **`models/`**: 领域模型或 ORM 扩展 (Prisma Schema 位于根目录 `/prisma`)。
- **`utils/`**: 共享工具类 (加密, 时间处理, 上传封装)。
- **`shared/`**: 类型定义 (Types)，常量，枚举。
- **`scripts/`**: 运维/数据迁移脚本。

### 3.2 请求处理流 (Request Flow)

1. **Request** -> **网关/Nginx** (SSL/负载均衡)
2. **App** -> **全局中间件** (Logger, Cors, RateLimit)
3. **Router** -> **鉴权中间件** (JWT 验证)
4. **Controller** -> 输入校验
5. **Service** -> 执行逻辑 (调用 DB/Redis/第三方服务)
6. **Response** -> JSON 标准格式响应

## 4. 关键业务模块与 Schema 概念

### 4.1 用户系统 (`User Module`)

- **实体**:
  - `sys_users`: 基础登录凭证。
  - `sys_colleges`: 学院/组织信息。
  - `user_profiles_student`: 儿童用户扩展信息。
  - `user_profiles_volunteer`: 志愿者扩展信息。
  - `user_profiles_admin`: 管理员扩展信息。
- **鉴权**: JWT Access Token + Refresh Token (可选)。Redis 黑名单用于登出。

### 4.2 内容系统 (`CMS Module`)

- **实体**: `cms_videos`, `cms_video_stats`。
- **流程**:
  1. **上传**: 客户端请求 STS Token -> 直传文件到 OSS -> 回调后端。
  2. **审核**: 状态初始为 `DRAFT` (草稿) -> 管理员审核 -> `PUBLISHED` (发布)/`REJECTED` (驳回)。
  3. **消费**: 仅 `PUBLISHED` 状态视频对公众可见。

### 4.3 直播系统 (`Live Module`)

- **实体**: `live_rooms`。
- **流程**:
  1. 志愿者发起申请 -> 管理员审批 (`PASSED`)。
  2. 开始直播 -> 后端生成推流地址/Token。
  3. 云厂商回调 -> 更新直播间状态 (`LIVING` 直播中 / `FINISHED` 已结束)。

### 4.4 互动与 AI (`Interaction & AI`)

- **互动**: 点赞 (`interaction_likes`)，收藏。利用 Redis 缓冲处理高并发写入。
- **AI 辅导**: 代理服务模式，后端过滤敏感词 -> 调用大模型 API -> 返回结果。

## 5. 开发指南 (Development Guide)

### 5.1 环境搭建 (Setup)

1. **安装依赖**: `npm install`
2. **环境配置**: 复制 `.env.example` 为 `.env`，配置 DB/Redis 连接信息。
3. **启动基础设施 (MySQL + Redis)**:
  - 确保已安装并启动 Docker Desktop
  - Windows 常见问题：如果出现 `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`，通常是 Docker Desktop 未启动（或 Docker Desktop Service 未运行/需要管理员权限）
  - 启动命令：`docker compose up -d`（或旧版：`docker-compose up -d`）
  - 注意：本项目默认将 Docker MySQL 映射到宿主机 `3307`（避免你电脑上已安装的 MySQL 占用 `3306`），因此 `.env` 里的 `DATABASE_URL` 也是 `localhost:3307`
4. **数据库同步**:
  - `npm run db:generate`
  - `npm run db:push`
5. **初始化演示数据（可选，推荐新手做）**:
  - `npm run db:seed`
6. **启动开发服务**: `npm run dev`

### 5.4 平台/管理员建档接口（PRD 对齐）

- 平台管理员可通过 API 创建学院、创建学院管理员账号、批量建档儿童账号。
- 学院管理员可创建志愿者账号（强制限定在本学院）。

常用接口：
- `POST /api/platform/colleges`（创建学院）
- `PATCH /api/platform/colleges/:id`（更新学院）
- `GET /api/platform/colleges`（学院列表）
- `POST /api/platform/college-admins`（创建学院管理员账号）
- `POST /api/users/children`、`POST /api/users/children/batch`（平台管理员建档儿童账号）
- `POST /api/users/volunteers/accounts`（学院管理员/平台管理员创建志愿者账号）
- `PATCH /api/users/me/password`（修改自己的密码）

视频管理端接口（用于审核列表/筛选/批量操作）：
- `GET /api/videos/admin`（管理端视频列表，默认 status=REVIEW，可筛选）
- `POST /api/videos/audit/batch`（学院管理员批量审核，抢先制；返回逐条结果）

提示：Swagger UI 默认在 `http://<host>:<port>/api/docs/`。

### 5.2 常用脚本

- **启动开发环境**: `npm run dev` (使用 `nodemon` 热重载)
- **构建项目**: `npm run build` (使用 `tsc` 编译)
- **生产环境启动**: `npm start` (运行 `dist/server.js`)

### 5.3 代码规范

- **代码风格**: Service 层推荐函数式写法。Controller 层可类化或函数化。
- **命名规范**: 变量/函数使用 camelCase，类/类型使用 PascalCase。
- **响应格式**:
  ```json
  {
    "code": 200,
    "message": "Success",
    "data": { ... }
  }
  ```
