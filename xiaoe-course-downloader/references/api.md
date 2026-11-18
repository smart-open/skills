# 小鹅通 H5 接口速查

所有 URL 前缀为店铺 H5 域名：`https://<app_id>.h5.xet.pomoho.com`。`app_id` 即子域名，例如 `appt8p2h33w9754`。

## 1. 店铺页面与课程列表

### 首页 micro_page_id
`GET /` 返回 SPA HTML，其中含 `"micro_page_id":<数字>`。用它作为 `page_id`。

### 微页面组件
```
POST /xe.micro_page.h5_index/1.0.0
Content-Type: application/json
{"app_id": "...", "page_id": "...", "agent_type": 1, "agent_version": 1,
 "agent": "<UA>", "app_version": "0.1"}
```
返回 `data.components[]`：组件含 `type`（goods / category_nav / image_ad …）、`id`、`list`、`more_url`。

### 组件「查看更多」课程
```
POST /xe.micro_page.h5_more/1.0.0
{"app_id": "...", "agent_type": 1, "agent_version": 1, "is_offset": 1,
 "app_version": "0.1", "agent": "<UA>",
 "buz_data": {"id": "<page_id>", "page_num": 1, "page_size": 20, "last_id": "",
              "component_id": "<component_id>", "channel_id": "", "alive_type": "",
              "order_by": "", "from_tag": 1}}
```
`more_url` 形如 `/p/decorate/more/<base64>`，base64 解码得 `{"id": page_id, "component_id": ...}`。
分页判断：`data.finished == true` 结束；否则把 `data.last_id` 带入下一页。

### 底部导航（可选）
```
POST /xe.micro_page.navigation.get/1.0.0
{"app_id": "...", "agent_type": 1, "agent": "<UA>", "app_version": "0.1"}
```

## 2. 课程目录与权限

```
POST /xe.course.business_go.avoidlogin.e_course.resource_catalog_list.get/1.0.0
bizData[app_id] / bizData[course_id] / bizData[p_id]=0 / bizData[order]=asc
bizData[page] / bizData[page_size]=100 / bizData[is_display_auth_sections]=1
```

`data.list[]` 关键字段：

| 字段 | 含义 |
|---|---|
| `resource_id` | 课时 id（视频为 `v_...`） |
| `resource_type` | 3 = 视频 |
| `resource_title` | 课时名 |
| `video_length` | 秒 |
| `subscribe` / `available` | 1/1 = 有观看权限 |
| `is_try` | 1 = 试看课时（未购买也可播） |

## 3. 播放地址

```
POST /xe.course.business_go.video.detail_info.get/2.0.0
bizData[resource_id]=<rid> / bizData[product_id]=<course_id> / bizData[opr_sys]=Win32
```

`data.video_urls` 是**加密字符串**：

```
若含 "__ba"：
  去掉 "__ba"
  字符映射 @->1  #->2  $->3  %->4
  "-"->"+"  "_"->"/"
  base64 解码（补 "=" 到 4 的倍数）
  结果可能是 JSON（多清晰度）或直接 URL
```

多清晰度时按 `definition_p` 选 720P。

## 4. 播放流

- m3u8 含 `#EXT-X-KEY:METHOD=AES-128,URI="...",IV=0x...`
- 分片为 AES-128-CBC 加密，IV 缺失时补 16 字节零
- 解密后按 PKCS7 去填充
- 全部 ts 按顺序拼接为一个 `.ts`，再用 `ffmpeg -c copy -bsf:a aac_adtstoasc` 转 mp4

## 5. 权限判定与不可绕过点

- 未购买时 `video.detail_info.get` 直接返回 `{"code":1,"msg":"暂无访问权限"}`。
- m3u8 与分片 URL 带 `sign`、`t` 时效签名，由服务端按权益生成，无法离线构造。
- 免费领课接口 `POST /xe.course.business.e_course.free_course_create_subscribe.post/1.0.0` 只对开放领取的商品有效；页面无「立即学习 / 0 元购买」按钮的课程调用无效。

## 6. 其他

- `POST /xe.course.business_go.core.info.get/2.0.0`：课程核心信息（含 `resource_cnt`）。
- `POST /xe.course.business_go.subscribe.check.get/2.0.0`：订阅关系（`code:0` 表示已订阅）。
- 请求头建议带 `Connection: close`，避免长连接被 CDN 复用后出现「慢速滴流」假死。
