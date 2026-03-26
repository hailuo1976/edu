# API 文档

## 基础信息

- **Base URL**: `http://localhost:3000`
- **Content-Type**: `application/json`

---

## 课程生成

### POST /api/course/generate

生成小学课程内容

**请求示例:**

```bash
curl -X POST http://localhost:3000/api/course/generate \
  -H "Content-Type: application/json" \
  -d '{
    "user_question": "分数的加减法怎么做？",
    "subject": "数学",
    "grade_level": 3
  }'
```

**请求参数:**

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|-----|
| user_question | string | 是 | 用户的课程问题 (1-500字) |
| subject | string | 是 | 学科: 数学、语文、英语、科学 |
| grade_level | number | 是 | 年级: 1-6 |

**响应示例:**

```json
{
  "success": true,
  "course_id": "COURSE_分数加减_20260323_001",
  "course": {
    "course_id": "COURSE_分数加减_20260323_001",
    "metadata": {
      "subject": "数学",
      "grade": 3,
      "topic": "分数的加减法",
      "estimated_minutes": 25,
      "difficulty": "medium"
    },
    "sections": [
      {
        "type": "intro",
        "title": "情境导入",
        "content": "小明把一个苹果切成两半..."
      },
      {
        "type": "concept",
        "title": "认识分数",
        "content": "分数由分子和分母组成..."
      }
    ],
    "knowledge_tags": ["分数", "加减法", "同分母"]
  }
}
```

**错误响应:**

```json
{
  "success": false,
  "error": "OpenCode API key is required"
}
```

---

## 课程列表

### GET /api/course/list

获取所有已生成的课程

**请求示例:**

```bash
curl http://localhost:3000/api/course/list
```

**响应示例:**

```json
{
  "success": true,
  "courses": [
    "COURSE_分数加减_20260323_001",
    "COURSE_面积_20260323_002"
  ],
  "total": 2
}
```

---

## 获取课程

### GET /api/course/:courseId

获取指定课程的详细信息

**请求示例:**

```bash
curl http://localhost:3000/api/course/COURSE_分数加减_20260323_001
```

**响应示例:**

```json
{
  "success": true,
  "course": {
    "course_id": "COURSE_分数加减_20260323_001",
    "metadata": {...},
    "sections": [...],
    "knowledge_tags": [...]
  }
}
```

**错误响应 (课程不存在):**

```json
{
  "success": false,
  "error": "课程不存在"
}
```

---

## 健康检查

### GET /api/course/health

检查服务状态

**响应示例:**

```json
{
  "status": "ok",
  "timestamp": "2026-03-23T10:00:00.000Z"
}
```
