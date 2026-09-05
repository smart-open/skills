# 🌐 多语言全栈层（非Java任务时加载）

*版本：v0.4 | 确认日期：2026-09-05*

> **层定位**：Java 编码风格见 coding 层；通用风格（中文注释、日志脱敏、卫语句、精简、3处抽公共、不过度设计）**全语言适用**；非Java语言按**业界最佳实践**执行（决议2026-09-05），实际使用中被纠正时走学习闭环进化。
> **优先级**：第八节"语言通用红线" > 各语言条目 > 各语言默认惯例。

## 一、Go（业界最佳实践）

1. 错误处理：错误即值，`if err != nil` 显式处理；包装用 `fmt.Errorf("xxx: %w", err)`；用 `errors.Is/As` 判断；库代码不panic
2. 项目结构：`cmd/ internal/ pkg/` 标准布局（golang-standards/project-layout）
3. 接口：小接口、在消费方定义；零值可用；避免全局状态
4. 并发：goroutine 必须有生命周期管理（errgroup）；context 传递取消信号；不裸 `go func()`
5. 日志：slog（标准库优先）/ zap，结构化日志
6. 测试：表驱动测试（table-driven）+ `t.Run` 子测试；标准 testing 包
7. 工具链：gofmt 强制 + golangci-lint
8. 命名遵循社区惯例（短名驼峰、不用get前缀），**注释仍中文**（通用红线）

## 二、Python（业界最佳实践）

1. 风格：PEP8 + **类型注解必写**（mypy校验）；ruff/black 统一格式
2. 工程：src 布局；pyproject.toml 统一配置；虚拟环境隔离
3. FastAPI：Pydantic 模型校验入参；依赖注入；async/await；APIRouter 按领域分模块
4. 错误处理：自定义异常类 + 全局异常处理器；错误消息中文（通用红线）
5. 日志：logging 标准库，结构化分级
6. 测试：pytest + fixtures + 参数化；不依赖外部资源（与Java测试决议一致）
7. AI工程：LangChain 链式 / LangGraph 图式编排；Prompt模板独立文件（与tools层方法论一致）

## 三、Node.js / TypeScript（NestJS）

1. TypeScript **strict 模式必开**，禁 any
2. NestJS：Module 模块化；Controller 薄、Service 承载业务（对齐 COLA 习惯）；DTO + class-validator 入参校验
3. 依赖注入贯穿；全局异常过滤器（ExceptionFilter）统一错误出口
4. 异步：async/await，禁止回调嵌套；进程级 unhandledRejection 兜底
5. 包管理：pnpm（lockfile 统一版本，对应 BOM 思想）
6. 测试：Jest；e2e 用 supertest
7. 日志：NestJS Logger 统一封装，分级+脱敏（通用红线）

## 四、前端 React / Vue

### 通用

1. TypeScript 必用（strict）；组件命名 PascalCase；目录结构 `components/ composables/ stores/ api/ utils/ types/`
2. API 层统一封装（对应后端 app service），错误在 Axios 拦截器统一处理
3. 状态最小化：服务端状态 TanStack Query，客户端状态 Zustand/Pinia，不混用
4. Zod schema 作为校验单一来源（表单与接口数据校验共用）

### React

5. 函数组件 + Hooks；逻辑抽取为自定义 Hook（use前缀）
6. 组件小组化、组合优于继承；key 用稳定ID不用索引
7. 性能：代码分割 lazy 优先做；useMemo/useCallback 适度，不过度优化
8. 表单：React Hook Form + zodResolver；Next.js 用 App Router

### Vue

9. 组合式 API（`<script setup>`）；逻辑抽取 composables（use前缀）
10. defineProps/defineEmits 类型化（defineProps<T>()）
11. Pinia store 按领域切分，不放服务端状态

## 五、Rust / Tauri

1. 错误处理：thiserror 定义错误枚举；生产代码禁 unwrap/expect；`Result<T,E>` 显式传播
2. Tauri：command + State 管理状态；前后端事件通信（emit/listen）
3. 所有权：借用检查友好设计；clone 显式且说明理由
4. 依赖：最小化；版本锁定 cargo.lock

## 六、Kotlin（Android 原生）

1. UI：Jetpack Compose 声明式；状态提升（state hoisting）
2. 架构：ViewModel + StateFlow 单向数据流；Hilt 依赖注入
3. 协程：structured concurrency（viewModelScope）；Flow 响应式
4. 惯用法：data class、sealed class 表达状态、扩展函数、空安全（?. / ?:）
5. 不写Java风格Kotlin（不用 lateinit 滥用、不用 !! ）

## 七、Taro（小程序跨端）

1. React 语法（与React技术栈同构）；按平台条件编译处理差异
2. 生命周期：useDidShow/useDidHide 等Taro Hooks
3. 状态：与Web端复用 Zustand；请求层统一封装（对应Axios封装习惯）
4. 包体积：按需引入、分包加载

## 八、语言通用红线（全栈一致，优先级最高）

- 中文注释、日志脱敏、错误消息中文可读——任何语言不变
- 依赖能不加就不加（core#D2）；版本锁定由包管理器统一（BOM / pnpm-lock / go.mod / requirements.txt / cargo.lock）
- 前后端同一需求的错误码、枚举语义保持一致
- 共用逻辑超过3处必抽公共（core#D3）
