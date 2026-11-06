# 本次验证 · 2026-11-06

结果：Web 27项、Dart 9项通过；TypeScript检查与Vite构建通过；隔离浏览器开始/暂停/手动恢复/归档/390px无溢出通过。

环境：Windows x64；Node 24.18.0；Dart 3.13.2；Java17/Android SDK36/Gradle8.13（笔记）；TypeScript5.9/Vite7/Vitest3（Web）。依赖版本以仓库锁文件为准。

运行：`npm ci; npm test; npm run build; cd kumo; dart pub get; dart test`。本机首次使用已有依赖缓存；笔记补齐JUnit4.13.2/org.json20240303后运行，最终结果如上。失败的初次移植尝试不能计为通过：已修复开发机回退路径、公开域名占位适配与跨模块测试依赖后复测。

范围：测试只覆盖本仓库明确构建的核心与合成示例。reference目录为宿主调用链资料，不纳入本独立构建。源产品2026-11-04的build94发布/设备/692项等历史数字没有并入本次总数。

未验证/未完成：完整生产GLB/字体/贴图未分发；当前示例为计时页，不是完整3D运行包；SHIO/KUMO公测未开放。

隐私与许可：按明确文件白名单收集，排除原Git历史/安装包/签名/生产配置/真实用户资料/录音/课表/抓包。逐文件来源与发布适配见SOURCE-MANIFEST，第三方边界见THIRD-PARTY。最终发布前还检查暂存区和所有待推送Git对象。
