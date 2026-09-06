# 🛠️ 工具生态层（选型/环境搭建/工具决策任务时加载）

*版本：v0.8 | 确认日期：2026-09-06*

## 一、技术栈清单

| 类别 | 选型 |
|------|------|
| 基础框架 | Java 8 / 11 / 21 多版本共存（**写代码前先确认项目Java版本**：8无var/record；11有var、HttpClient；21有虚拟线程、record、sealed、模式匹配）/ Spring Boot / Spring Cloud Alibaba |
| 语言广度 | Java主力；Go / Python（AI+FastAPI）/ Node.js（NestJS）/ Rust（Tauri）；详见 polyglot 层 |
| 微服务 | Nacos / Dubbo / Seata / xxl-job |
| 中间件 | Kafka / RabbitMQ / Redis / ES / MongoDB / Neo4j / PostgreSQL / MinIO / RustFS（Rust实现S3兼容对象存储） |
| 数据访问 | MyBatis / liquibase（变更版本化） |
| 工具库 | Hutool（全家桶）/ Lombok / mica-auto |
| 文档 | smart-doc（接口）/ README即产品手册 |
| 运维 | Docker / K8s / PLG(Promtail+Loki+Grafana) / prometheus / ELK / docker swarm+portainer |
| 信创与适配 | 信创环境适配、数据库迁移、集群负载均衡（GSLB）、跨平台构建（arm64/x86，Dockerfile分架构+build.sh） |
| 构建工程化 | git-commit-id-plugin（构建可追溯）/ source-plugin发布源码 / release插件autoVersionSubmodules / 跨平台native打包 |
| AI工程化框架 | Python侧：LangChain + LangGraph；Java侧：LangChain4j + LangGraph4j（**按项目主语言选框架**）；平台侧：Dify / AgentScope / MCP / RAG / Skill体系 / Agent.md记忆 |

## 二、选型决策模式

- 优先复用已有生态（Hutool优先于Guava，Spring生态优先于第三方轮子）
- **关系型数据库偏好**（决议）：新项目默认 PostgreSQL（物模型/元数据类场景 JSONB + GIN 索引优势；高并发网关/接入类组件可考虑 Go 实现）
- **一手源纪律**（业界增补决议）：选型/调研的每个关键声明追溯**一手来源**（官方文档/源码/spec/第一方API），不看二手转述；调研结论落盘时标注来源，供后续复核
- 中间件能不加就不加（依据D2），加之前先问：维护成本、运维成本谁来承担
- 版本由BOM统一管理，业务pom不写版本号
- 新技术先在非核心模块试点（近2年AI工程化路径：先工具后平台）

## 三、AI工程化方法论（近2年核心实践）

- **Prompt模板化**：协议转换等AI处理逻辑沉淀为模板文件（如 protocol-transform-prompt-template.md），与代码分离、版本化管理
- **项目记忆**：项目达到MVP后构建Agent.md记忆 = 架构约定 + 模块地图 + 决策上下文 + **领域术语表（共享语言）**——项目黑话统一定义，变量/函数/文件命名与之一致，会话更省token
- **Agent文档写作纪律**（业界增补决议，适用于Agent.md/技能文档/画像README等一切agent消费的文档）：①**两负荷**——上下文负荷（常驻每轮的token与注意力）vs 认知负荷（人找文档的成本，"人是索引"，花在人类判断关键处，不一味压缩）②**指针措辞**决定触发可靠性——触发词前置、一支一触发（同义触发词合并）、不重复正文已自带的身份信息③**环境即源真**——环境可查的（配置/脚本/目录结构）不写进文档，只写查不到的：约定、选择的原因、坑④**同址**——一个概念的定义/规则/坑收在同一标题下，不散落⑤**禁令改正面表述**——"不要X"会把X拉进注意力反而更易触发；描述目标行为，仅硬红线可用禁令且配正面目标
- **信任分级协作**：简单任务AI自主生成+人工抽查；核心决策（架构/安全/数据变更）必须人工确认
- **Agent安全基线（业界增补决议）**：致命三要素——私有数据、不可信内容、外部通信——绝不在同一运行时共存（三者齐备=提示注入升级为数据外泄）；外部skill/MCP引入前先审查（Snyk实测36%公开skill含提示注入，skill按供应链工件对待）；敏感路径（.ssh/.aws/.env）拒绝AI读取；**画像库/语料库=记忆资产，HITL确认门是防"记忆投毒"的关键防线，永不放开自动入库**
- **AI能力嵌入业务**：对账智能匹配、凭证自动校验、差异智能识别等"AI+业务"融合模式（数据分析引擎+智能体工作台）

## 四、Skill组合策略（自有矩阵）

| 场景 | 组合 |
|------|------|
| 代码审查 | alibaba/open-code-review（行级漏洞扫描）+ ponytail（精简）|
| Agent开发 | superpowers-zh（需求拆解）+ caveman（token降噪）|
| 读老项目 | Understand-Anything + ponytail |
| 可视化 | code-review-graph → generating-dot-assets → Archify / fireworks-tech-graph |
| 汇报 | Archify + guizang-material-illustration + report-generator |

**互斥规则**：ponytail 与 superpowers/superpowers-zh 的TDD子skill互斥，共存时必须关闭TDD

**注意**：open-code-review为CLI+Skill，必须安装npm包；caveman为通用降噪可与全部skill叠加；baoyu-skills按需加载子skill不要全量
