# 沉浸式专注计时：窗间、汐间与云间

按实际技术栈整理三种专注场景：MADO/窗间和SHIO/汐间是 TypeScript/Vite/Three；KUMO/云间是 Dart/Flutter，不能按同一 Web 工程接入。当前公测只有 MADO 可进入，其余入口为预告。另已只读核对管理版 build94：study_hub.dart 的三个场景都有点击入口，scene_packs.dart 允许mado/haijian，flight转到FocusFlightScreen；这是源码入口核对，非本轮设备验收。公开reference取自公测版，未发布管理APK或管理配置。

## 运行核心示例

```sh
npm ci
npm run dev
# 打开终端给出的 localhost 地址
npm test
npm run build
cd kumo
dart pub get
dart test
```

Web 示例使用真实 MADO SessionStore，五分钟开始/暂停/继续/归档；恢复后先暂停等手动继续，隐藏/退出时保存。示例使用系统字体与原创简单页面，没有生产3D模型。原完整场景 TS/CSS 与 Flutter 宿主代码在 reference，供集成研究；它不是附齐资源的完整三场景发行包。

## 状态、协议与释放

MADO：开始创建一杯咖啡，elapsed 基于累计值+运行起点；pause固定累计，resume重设起点，finish按id幂等归档。原生产入口冷启动/恢复均先回店外首页，不自动续计。画质由 quality.ts 约束 GPU尺寸、DPR、像素预算、阴影与MSAA；ultra最高DPR3/12,582,912像素/4096阴影，但触屏与硬件上限会降低实际配置，不承诺全机型60FPS。

SHIO：取票、等待横屏与休息不计有效专注，钓鱼交互另有状态；session 依赖 opportunity/settings/sound-mix。KUMO：FocusFlightClock 按时间推导阶段，大圆航线插值；移除了来源未核实的大机场库，仅保留五个用于测试的示例点，不作导航数据。

`scenes/shared/iko-host.ts` 定义 pause/visible/dispose/settings，与同源postMessage、每秒快照和requestId回执。一个场景一个权威计时器，宿主只保存快照，不能再叠一套倒计时。Flutter StudySceneScreen 只允许本地origin，后台pause，退出发dispose并最多等3秒，待保存队列后加载about:blank、关闭本地HTTP服务。Web音频节点、动画/渲染器、纹理、交互监听和延迟加载回调都应在dispose释放。

接其它 App 时先接StoragePort和可注入now，验证暂停/恢复/存储错误；再接宿主协议和资源服务，最后接模型与音频。使用WebView时限制导航和JS桥origin，样式封在自己的页面；GLTF迟到不能把已退出场景重挂载。KUMO完整UI另有原生提醒/音频channel，退出停止timer/animation/audio。

[本次验证](VALIDATION.md) · [资源与许可边界](THIRD-PARTY.md) · [三场景来源](SOURCE-MANIFEST.json)
