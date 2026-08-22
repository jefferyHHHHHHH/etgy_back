# 儿童账号设备绑定前后端交接说明

## 1. 背景

为了兼顾上线安全和灰度控制，后端增加了全局开关：

```env
CHILD_DEVICE_BINDING_ENABLED=false
```

当前默认值为 `false`，表示儿童账号设备绑定功能已关闭，前端无需在登录流中强制走设备绑定逻辑。

## 2. 运行时行为

### 2.1 开关关闭（当前生产/默认状态）

当 `CHILD_DEVICE_BINDING_ENABLED=false` 时：

- 儿童账号登录直接返回：
  ```json
  {
    "code": 200,
    "message": "Login success",
    "data": {
      "token": "...",
      "user": { ... }
    }
  }
  ```
- 不返回 `bindRequired`
- 不要求前端调用 `/api/auth/device/bind/confirm`
- 不要求前端传 `deviceId` / `deviceInfo` 参与绑定

前端处理方式：

- 直接按普通登录成功处理
- 保存 `token`
- 进入应用主流程

### 2.2 开关开启时

当 `CHILD_DEVICE_BINDING_ENABLED=true` 时：

- 若儿童账号未绑定设备，后端会在登录时返回：
  ```json
  {
    "code": 200,
    "message": "Login success",
    "data": {
      "bindRequired": true,
      "bindToken": "...",
      "user": { ... }
    }
  }
  ```
- 前端需拿 `bindToken` 调用：
  ```http
  POST /api/auth/device/bind/confirm
  ```
- 请求体示例：
  ```json
  {
    "bindToken": "...",
    "deviceInfo": {
      "platform": "android",
      "model": "Pixel 8",
      "osVersion": "14",
      "appVersion": "1.0.0"
    }
  }
  ```
- 成功后返回：
  ```json
  {
    "code": 200,
    "message": "OK",
    "data": {
      "token": "...",
      "user": { ... }
    }
  }
  ```

### 2.3 已关闭时的接口约定

若前端误调用：

```http
POST /api/auth/device/bind/confirm
```

后端会返回：

```json
{
  "code": 403,
  "message": "Child device binding is disabled by configuration"
}
```

这属于正常“功能关闭”行为，不应把它当作异常登录失败处理。

## 3. 前端接入建议

### 推荐策略

1. 读取后端环境变量或文档确认当前是否开启绑定
2. 如果功能关闭：完全走普通登录流程
3. 如果功能开启：在登录成功响应中检查 `bindRequired`
4. 若 `bindRequired === true`：调用绑定确认接口并拿回最终 token

### 伪代码示例

```ts
const res = await login({ username, password, deviceId, deviceInfo });

if (res.data?.bindRequired === true) {
  const bindRes = await confirmDeviceBinding({
    bindToken: res.data.bindToken,
    deviceInfo,
  });

  if (bindRes.data?.token) {
    saveToken(bindRes.data.token);
    return;
  }
}

if (res.data?.token) {
  saveToken(res.data.token);
}
```

## 4. 后端行为摘要

- 绑定功能由 `CHILD_DEVICE_BINDING_ENABLED` 控制
- 默认：关闭
- 当前后端已按关闭状态实现，儿童端无需做绑定二次确认

## 5. 交接对象

- 后端：认证与设备绑定逻辑入口在 `src/services/auth.service.ts`
- 配置：`src/config/env.ts`
- 接口文档：`src/routes/auth.routes.ts`
- 说明文档：`README.md`

## 6. 结论

当前阶段前端不需要强制适配“设备绑定”分支，除非后端将 `CHILD_DEVICE_BINDING_ENABLED=true` 开启。否则按普通登录逻辑即可。
