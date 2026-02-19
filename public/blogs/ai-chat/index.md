# 更新说明

##  本次新增功能
> <span style="color:#165DFF; font-weight:bold;">添加了项目页面的对话按钮，现在点击按钮就可以与真寻对话啦，支持流式输出以及语音识别和多模态，多模态使用base64返回以避免公网url的使用，语音识别使用浏览器的web speech api，完全免费。</span>

## 主要特性

### 1. 智能对话
- 流式输出，实时显示 AI 回复
- 支持多轮对话，上下文连贯

### 2. 多模态输入
- **文本输入**：支持多行文本，Shift+Enter 换行
- **图片上传**：支持上传图片让 AI 分析（最大 5MB）
- **语音识别**：使用浏览器原生 Web Speech API，免费且无需额外配置
- **特别注意**：语音识别需要麦克风权限和浏览器支持

### 3. 用户体验
- 建议问题快速开始对话
- 响应式设计，移动端适配
- 优雅的动画效果
- 实时加载状态提示

### 4.隐私保护
- 语音数据由浏览器处理
- 不经过第三方服务器
- 符合隐私保护要求

## 使用方法

### 访客使用
1. 点击项目页面的"与 AI 对话"按钮
2. 选择建议问题或输入自己的问题
3. 可选：上传图片或使用语音输入
4. 发送消息，等待 AI 回复

## 技术实现

### 使用的 API

我使用了浏览器内置的 **Web Speech API**，这是一个完全免费的 W3C 标准 API。

```typescript
// 获取语音识别对象
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
const recognition = new SpeechRecognition()
```

### 核心配置

```typescript
// 配置语音识别参数
recognition.continuous = false      // 不连续识别（说完一句就停止）
recognition.interimResults = true   // 显示临时结果（实时显示识别内容）
recognition.lang = 'zh-CN'          // 设置语言为中文
```

### 关键事件处理

#### 1. 识别结果事件
```typescript
recognition.onresult = (event) => {
  // 将所有识别结果拼接成文本
  const transcript = Array.from(event.results)
    .map(result => result[0])
    .map(result => result.transcript)
    .join('')
  
  // 更新输入框内容
  setInput(transcript)
}
```

#### 2. 识别结束事件
```typescript
recognition.onend = () => {
  setIsRecording(false)  // 更新录音状态
}
```

#### 3. 错误处理
```typescript
recognition.onerror = (event) => {
  console.error('语音识别错误:', event.error)
  
  // 根据不同错误类型给出提示
  if (event.error === 'no-speech') {
    toast.error('未检测到语音，请重试')
  } else if (event.error === 'not-allowed') {
    toast.error('请允许使用麦克风')
  }
}
```
