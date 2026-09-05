# 🏗️ 架构偏好层（设计/架构/组件任务时加载）

*版本：v0.3 | 确认日期：2026-09-05*

## 一、系统架构

1. DDD/COLA分层：`adapter`(薄控制器) / `app`(service编排) / `domain`(entity/gateway/manager/provider) / `infrastructure` / `client-dto`
2. Controller只做：参数校验 + 转发 + 日志，业务全在app层
3. 双网关模式：**Manager管数据访问，Provider管外部服务调用**
4. 领域事件在**事务提交后发布**（runAfterTxnCommit），与ES索引事件分离
5. 数据库变更liquibase版本化管理；接口文档smart-doc
6. 数据一致性优先：多步骤业务必须有事务/补偿逻辑，防部分成功部分失败
7. 优雅停机：Spring graceful shutdown + kill信号处理，在途请求排空、异步任务收尾（业界增补决议）
8. 参数显式化：线程池、连接池、超时等关键参数显式配置并注释理由，禁用默认值（业界增补决议）
9. 配置中的密码/密钥用jasypt等加密存储，禁止明文入库入仓（业界增补决议）
10. REST接口URL版本化（/v1/xxx），接口升级保持旧版本兼容（业界增补决议）

## 二、扩展性设计

11. 策略模式 + 自注册工厂：实现类 `init()` 时注册，工厂按类型分发，返回Optional
12. 模板方法用接口 `default` 方法下沉公共逻辑，子类只写差异
13. 扩展点用 `@Autowired(required=false)` 收集用户Bean组成处理链，允许业务覆盖内置实现
14. 条件→处理器映射表驱动：`Collectors.toMap(processor::getCondition, processor::getProcessor)`

## 三、组件设计哲学（沉淀公共能力时）

15. 模块垂直按能力切分；版本统一上收BOM/dependencyManagement，子pom零版本号
16. 组件默认内置可观测性与重试（全局注入actuator/prometheus/spring-retry）
17. 配置类即文档：`@ConfigurationProperties` + 嵌套分组 + 默认值 + 条件装配三件套（`@ConditionalOnProperty`/`@ConditionalOnMissingBean`/`@ConditionalOnBean`）
18. Helper类收敛复杂度：业务方一个lambda接入（如 `asyncTaskHelper.generateAsynTask(task -> {...})`），自动处理调度/上下文透传/进度存储
19. 异常体系：`BaseException(status数字 + code字符串 + args占位)` 基类，按模块就近分层子类
20. README即产品手册：emoji分节（📚简介/📦安装/👕示例）+ 可运行示例 + 返回JSON样例
21. 第三方依赖主动exclusion风险传递依赖；SPI注册文件用mica-auto编译期生成
22. 构建可追溯：git-commit-id-plugin生成git.properties；源码随构件发布（source-plugin）
23. 跨平台部署：Dockerfile按架构分离（x86/arm64）+ 对应build.sh；native库跨平台打包

## 四、深模块设计原则（模块/接口设计时，业界增补决议）

24. **深模块 = 小接口藏大实现**：大量行为藏在少量接口后面（接口=调用方必须知道的一切：签名+不变量+顺序约束+错误模式+性能特征）。浅模块=接口几乎和实现一样复杂，避免。设计接口先问三问：方法能更少吗？参数能更简吗？里面还能藏更多复杂度吗
25. **删除测试**：想象删掉这个模块——复杂度凭空消失，说明它只是转发层（砍）；复杂度在N个调用点重现，说明它配得上存在（留）
26. **接缝与适配器**：只有"会变化"才配拥有接缝——单一适配器=假设性接缝，两个适配器才是真接缝（依据D2不过度设计）
27. **可测试性设计**：接受依赖注入而非自己创建（`processOrder(order, gateway)` 而非内部`new StripeGateway()`）；返回结果而非就地副作用（`calculateDiscount(cart)` 而非 `applyDiscount(cart): void`）；测试面=接口面——想测到接口后面去，说明模块形状不对

## 五、原型思维（设计存疑时的并行逻辑，业界增补决议）

28. 设计争议无法靠讨论解决时，**并行造一次性原型回答问题**，而非纸上争论：逻辑/状态机存疑→单个可交互HTML推演（把状态机推过纸上难推理的路径）；UI形态存疑→同一路由多方案切换对比
29. 原型规则：命名即标记一次性；一条命令可跑；默认不持久化（状态在内存）；不做打磨（无测试/无异常处理/无抽象）；每次操作后完整暴露状态变化
30. **验证后只留决策**：把验证过的决策折入真实代码；原型本身提交到一次性分支存证（main只保留决策）；问题与结论记入issue/commit——下一个读者学的是结论，不是演示

## 六、架构红线

- ❌ 过度设计、堆砌中间件（依据D2）
- ❌ 定制逻辑（特定租户/协议）混入通用服务
- ❌ 硬编码配置（地址/密钥/魔法数字）不抽取配置
- ❌ 调用外部服务无超时/降级/熔断
