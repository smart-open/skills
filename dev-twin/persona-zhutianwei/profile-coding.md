# ✍️ 编码习惯层（编码/审查任务时加载）

*版本：v0.3 | 确认日期：2026-09-06*

## 一、注释与文档

1. **注释与文档一律中文，语言简洁明了**（决议）；类注释单行简洁（`/** 对账规则执行 */`）；行内注释做"步骤分节"
2. 方法注释解释**意图和边界条件**，不罗列参数；禁止空@return、错别字
3. `@Slf4j`；info标记流程节点，debug做过程追踪；循环内大对象日志用 `if(log.isDebugEnabled())` 包裹
4. 异常日志带堆栈：`log.warn("xxx: {}", e.getMessage(), e)`
5. **敏感信息（手机号/邮箱/密码/jwt/token）日志必须打码**（决议）

## 二、命名

6. 语义前缀成对命名：source/dest、matched/unmatched
7. 分层后缀：Service / Support / Manager / Provider / Execute
8. 枚举自带 `getLabel()/getCode()`，覆盖所有业务状态；业务状态禁用String硬编码
9. 禁止：版本化方法名（xxx2/New后缀）、拼音、无意义缩写（rev/val/flag）、拼写错误

## 三、实现风格

10. Hutool全家桶替代手写判空/转换：`CollUtil/StrUtil/Convert/ObjectUtil/JSONUtil/IdUtil`
11. Lombok四件套：`@Slf4j @RequiredArgsConstructor @Data @Builder`；构造器注入final字段
12. 业务异常：`throw new ServiceException("中文消息")`；含上下文用 `StrUtil.format("对账规则[{}]，比对规则[{}]...", ...)`
13. `Pair<Boolean,String>` 承载"结果+失败原因"（成功时value为空串）
14. 不使用Optional，返回null/emptyList（决议）
15. Stream用于集合管道（toMap/groupingBy/filter）；需边遍历边删除时用Iterator
16. 卫语句式空检查，防御式编程；魔法数字必须校验（如批量上限500）
17. 分布式防重：`@DistributedLock(identifier = "#request.uuid")`；自代理调事务方法：`SpringUtil.getBean(this.getClass())`
18. 配置开关控制debug过程数据落库
19. **方法通常≤200行（复杂场景最大300行），参数≤5个**（决议）
20. Controller入参用 `@Validated` + Bean Validation注解校验（@NotNull/@Size等），替代手工if判空（业界增补决议）
21. 关键链路（DB查询、外部调用、大循环）打印耗时日志或埋Micrometer指标（业界增补决议）
22. 对外API返回的DTO考虑不可变（final字段+builder）；内部DO保持@Data（业界增补决议）
23. 架构健壮（决议）：优雅停机；线程池/连接池/超时参数显式化并注释理由；配置密钥jasypt加密；REST接口URL版本化(/v1)

## 四、测试规范（业界增补决议）

- 核心业务代码**强制配套单测**：JUnit5 + Mockito，测试方法名用 given-when-then 或中文场景描述，覆盖核心分支+异常场景
- 测试可重复跑、不依赖外部资源（如数据唯一性），与原则一致
- 智能适配：项目有测试基础设施（依赖+目录）→ 同步生成测试；无基础设施 → 只生成代码并**提示用户补测试**，不擅自搭建测试设施

## 五、必须避免（历史包袱清单）

- ❌ 复制粘贴镜像分支（source/dest近乎相同代码）→ 参数化抽取
- ❌ 死代码、注释掉的代码块、无效语句不清理
- ❌ 裸catch吃掉异常；原始堆栈透传前端
- ❌ 接口+全static方法的常量接口反模式
- ❌ 同一大对象日志重复打印多次
- ❌ 系统级RuntimeException/IllegalArgumentException混用（统一ServiceException体系）
