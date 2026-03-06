# 中风康复训练系统开发问题总结

这两天在构建动作捕捉系统时遇到了一些难题，主要是mediapipe的版本和opencv以及numpy冲突的问题，最关键的是必须使用anaconda构建环境，否则TensorFlow无法使用，且官方pip已经移除了mediapipe0.10.30以下的版本因此必须使用0.10.30以上由于0.10.30在windows环境上有部分bug因此推荐升级至0.10.32。项目我已开源，可在我的项目页查看详情以及github链接

## 一、核心问题背景

本项目基于 OpenCV + MediaPipe 开发中风康复训练动作捕捉系统，在环境配置和代码运行阶段遭遇多轮版本兼容问题，核心源于：

1. Python 版本（3.10）、NumPy 版本（2.x/1.x）、OpenCV 版本（4.13+/4.8.x）、MediaPipe 版本（0.8.x/0.10.x）之间的兼容性冲突
2. MediaPipe 官方下架 0.10.30 以下版本，且 0.10+ 版本废弃旧 `solutions` API，改用全新 `tasks` API，导致原有姿态检测代码无法运行
3. PyQt5 组件使用不当导致的运行时错误
4. Matplotlib 中文显示问题
5. 界面刷新机制缺失

## 二、关键问题梳理

### 1. 环境依赖冲突问题

| 问题现象 | 根因 | 解决方案 |
|----------|------|----------|
| `AttributeError: module 'mediapipe' has no attribute 'solutions'` | MediaPipe 0.10.30 移除了 solutions 模块 | 升级到 0.10.32 并迁移到 tasks API |
| `Could not find a version that satisfies the requirement mediapipe==0.8.10` | MediaPipe 0.8.x 版本已从官方源下架 | 使用 0.10.32 版本 |
| `function 'free' not found` | MediaPipe 0.10.30 在 Windows 上的已知 bug | 升级到 0.10.32 修复 |

### 2. MediaPipe API 兼容性问题

| 问题现象 | 根因 | 解决方案 |
|----------|------|----------|
| `module 'mediapipe' has no attribute 'solutions'` | 0.10+ 版本移除了 solutions.pose 模块 | 改用 tasks.vision.PoseLandmarker |
| 姿态检测功能无法初始化 | 新 API 需要加载模型文件 | 自动下载 pose_landmarker_lite.task 模型 |
| 关键点数据结构变化 | 新 API 返回的数据结构不同 | 重写 get_landmarks 方法适配新结构 |

### 3. PyQt5 使用问题

| 问题现象 | 根因 | 解决方案 |
|----------|------|----------|
| `TypeError: setAlignment(self, a0: Union[Qt.Alignment, Qt.AlignmentFlag]): argument 1 has unexpected type 'int'` | 使用整数 1 代替 Qt.AlignCenter 常量 | 导入 Qt 模块，使用 Qt.AlignCenter |

### 4. Matplotlib 中文显示问题

| 问题现象 | 根因 | 解决方案 |
|----------|------|----------|
| 统计图表中文显示为方框 | Matplotlib 默认不支持中文字体 | 配置 SimHei/Microsoft YaHei 字体 |

### 5. 界面刷新问题

| 问题现象 | 根因 | 解决方案 |
|----------|------|----------|
| 训练结束后计划进度不更新 | 主窗口未实现动态刷新机制 | 添加 refresh_ui 方法重建界面 |

## 三、核心解决方案

### 1. 环境适配方案（终版兼容配置）

| 依赖包 | 最终选定版本 | 选择依据 |
|--------|--------------|----------|
| Python | 3.10 | 兼顾项目 UI 框架（PyQt5）和第三方库兼容性 |
| NumPy | 1.24.4 | 兼容 MediaPipe 0.10+ 和 OpenCV 4.8.x |
| OpenCV | 4.8.1.78 | 避免强制依赖 NumPy 2.x |
| MediaPipe | 0.10.32 | 官方最新稳定版，修复 Windows bug |
| PyQt5 | 5.15.10 | 稳定版本，兼容 Python 3.10 |
| Matplotlib | 3.8.2 | 兼容 NumPy 1.24.4 |
| pyttsx3 | 2.90 | 语音反馈功能 |

### 2. MediaPipe API 迁移方案

#### 2.1 旧 API（0.8.x）
```python
import mediapipe as mp

mp_pose = mp.solutions.pose
mp_drawing = mp.solutions.drawing_utils
pose = mp_pose.Pose(
    static_image_mode=False,
    model_complexity=1,
    min_detection_confidence=0.5
)

results = pose.process(frame_rgb)
landmarks = results.pose_landmarks.landmark
```

#### 2.2 新 API（0.10.32）
```python
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# 加载模型
base_options = python.BaseOptions(model_asset_buffer=model_data)
options = vision.PoseLandmarkerOptions(
    base_options=base_options,
    running_mode=vision.RunningMode.VIDEO,
    min_pose_detection_confidence=0.5,
    min_tracking_confidence=0.5
)
detector = vision.PoseLandmarker.create_from_options(options)

# 检测姿态
mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)
results = detector.detect_for_video(mp_image, timestamp_ms)
landmarks = results.pose_landmarks[0]  # 返回列表
```

#### 2.3 关键变化点
1. 模块导入路径变化：`mp.solutions.pose` → `mediapipe.tasks.python.vision`
2. 初始化方式变化：需要显式加载模型文件
3. 检测方法变化：`process()` → `detect_for_video()`
4. 数据结构变化：`pose_landmarks.landmark` → `pose_landmarks[0]`
5. 绘制方法变化：需要自己实现绘制逻辑

### 3. PyQt5 问题修复

#### 3.1 对齐参数修复
```python
# 错误写法
title.setAlignment(1)

# 正确写法
from PyQt5.QtCore import Qt
title.setAlignment(Qt.AlignCenter)
```

### 4. Matplotlib 中文支持

```python
import matplotlib.pyplot as plt

# 配置中文字体
plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei', 'Arial Unicode MS']
plt.rcParams['axes.unicode_minus'] = False

# 使用时无需指定 fontproperties
ax.set_xlabel('日期')  # 直接使用中文
```

### 5. 界面刷新机制

```python
def refresh_ui(self):
    """刷新界面显示"""
    # 清空当前布局
    while self.main_layout.count():
        item = self.main_layout.takeAt(0)
        if item.widget():
            item.widget().deleteLater()
    
    # 重新构建界面
    self.setup_patient_ui(self.main_layout)

def start_training(self, action_type):
    training_window = TrainingWindow(...)
    training_window.exec_()
    # 训练结束后刷新
    self.refresh_ui()
```

## 四、开发过程中的其他问题

### 1. 训练计划功能缺失
**问题**：训练计划只能添加，但在患者界面没有展示和使用。

**解决方案**：
- 在患者主界面显示最近 3 个训练计划
- 实时计算计划完成进度（完成次数、平均得分）
- 根据目标判断计划完成状态
- 医生端可查看患者计划完成情况

### 2. 退出登录功能缺失
**问题**：无法切换账号，需要重启程序。

**解决方案**：
- 在主窗口添加退出登录按钮
- 修改主程序循环逻辑，支持返回登录界面
- 使用 logout_flag 标记退出类型

### 3. 日期时间类型处理
**问题**：数据库返回的日期可能是字符串或 datetime 对象。

**解决方案**：
```python
plan_date = plan.created_at
if isinstance(plan_date, str):
    plan_date = datetime.strptime(plan_date, '%Y-%m-%d %H:%M:%S')
```

## 五、最终效果

### 1. 环境层面
- 所有依赖包版本兼容，无 import 报错
- MediaPipe 姿态检测功能正常
- 摄像头实时捕捉稳定

### 2. 功能层面
- 姿态检测模块可正常初始化，实时捕捉人体关键点
- 角度计算、动作评分、语音反馈等核心功能完整
- 训练计划系统完整可用，实时显示进度
- 数据统计图表正常显示中文
- 界面刷新机制正常，数据实时更新
- 退出登录功能正常，可切换账号

### 3. 用户体验
- 界面友好，操作流畅
- 训练反馈及时，指导清晰
- 数据统计直观，进度可视化
- 账号切换方便

## 六、经验总结

### 1. 版本兼容性管理
- 优先选择社区验证过的稳定版本组合
- 避免使用最新版本，防止未知兼容性问题
- 使用 requirements.txt 锁定依赖版本
- 定期关注依赖库的更新日志

### 2. API 迁移策略
- 第三方库升级需提前查阅官方迁移文档
- 封装核心功能模块，预留 API 适配层
- 保持对外接口稳定，降低改造成本
- 编写兼容性测试脚本验证功能

### 3. 问题排查方法
- 优先查看完整错误堆栈
- 使用最小化测试脚本定位问题
- 查阅官方文档和 GitHub Issues
- 测试脚本运行后及时清理

### 4. 代码质量保证
- 保持项目结构清晰，模块职责单一
- 避免代码冗余，提取公共逻辑
- 添加必要的注释和文档
- 使用类型提示提高代码可读性

### 5. 用户体验优化
- 界面操作要有即时反馈
- 数据更新要实时刷新
- 错误提示要清晰友好
- 功能设计要符合用户习惯

## 七、开发规范建议

### 1. 环境配置
- 使用虚拟环境隔离项目依赖
- 在 Windows 环境下使用指定的 Python 路径
- 配置国内镜像源加速包下载

### 2. 代码规范
- 保持项目结构清晰，文件精炼不冗余
- 不创建过多说明文档和测试脚本
- 测试脚本运行后及时删除
- 使用中文注释和文档

### 3. 依赖管理
- MediaPipe >= 0.10.32（使用新 tasks API）
- 所有包版本已移除 0.10.30 以下支持
- 定期更新 requirements.txt

### 4. 沟通规范
- 始终使用中文回答
- 不使用 emoji 表情
- 保持简洁专业的沟通风格

## 八、待优化项

### 1. 性能优化
- 姿态检测帧率优化
- 数据库查询性能优化
- 界面渲染性能优化

### 2. 功能完善
- 增加更多康复动作类型
- 支持训练视频录制回放
- 添加训练提醒功能
- 实现数据导出功能

### 3. 用户体验
- 优化界面布局和配色
- 添加操作引导和帮助文档
- 改进错误提示信息
- 支持个性化设置

### 4. 系统稳定性
- 添加异常处理机制
- 实现日志记录功能
- 添加数据备份功能
- 优化资源释放逻辑

## 九、技术债务

### 1. 模型文件管理
当前模型文件在首次运行时自动下载，建议：
- 将模型文件打包到项目中
- 添加模型文件完整性校验
- 支持离线运行

### 2. 数据库迁移
当前使用 SQLite，未来可能需要：
- 支持 MySQL/PostgreSQL
- 实现数据库版本管理
- 添加数据迁移脚本

### 3. 配置管理
当前配置硬编码在代码中，建议：
- 使用配置文件管理
- 支持环境变量配置
- 实现配置热更新

### 4. 测试覆盖
当前缺少自动化测试，建议：
- 添加单元测试
- 添加集成测试
- 实现 CI/CD 流程

## 十、总结

本项目成功解决了 MediaPipe API 迁移、环境依赖冲突、界面组件使用等多个技术难题，实现了一个功能完整、用户体验良好的中风康复训练系统。通过本次开发，积累了丰富的版本兼容性处理经验和 API 迁移经验，为后续类似项目提供了宝贵的参考。
