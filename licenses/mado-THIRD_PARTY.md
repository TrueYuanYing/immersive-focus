# 公开素材来源

## 咖啡馆标题字体

- 字体：荆南麦圆体 / KNMaiyuan，作者 Kingnam Type Foundry（荆南字坊）。
- 上游：[maoken-fonts/KNMaiyuan](https://github.com/maoken-fonts/KNMaiyuan)，字体原文件 `fonts/TTF/KNMaiyuan-Regular.ttf`。
- 许可：SIL Open Font License 1.1，全文随场景打包于 `public/fonts/OFL-KNMaiyuan.txt`。
- IKO 修改：按当前界面字符裁剪并转换为 WOFF2，派生字族命名为 `IKO Cafe Hand`；保留字形轮廓，将数字设为相同前进宽度以稳定倒计时。用于店名、显眼标题、小票店名、时长输入和倒计时，正文仍使用系统字体。
- 原始文件 SHA-256：`94ea78c51086b1ea58c1744784b2335dea2c5ef1c5193b80e02c7d46b8e0283f`。使用 `tool/build-display-font.py` 可重新生成；新增界面文案后需要重新裁剪。

## 二次元学生基础模型

- 作者：VRoid Project / pixiv Inc.
- 资产：旧版 VRoid Studio β AvatarSample_1；归档文件名 `AvatarSample_D.vrm`。
- 原作者许可：[β Ver AvatarSample_1 — CC0](https://vroid.pixiv.help/hc/en-us/articles/360012381793-%CE%B2-Ver-AvatarSample-1)。
- 许可区分说明：[VRoid sample conditions](https://vroid.pixiv.help/hc/en-us/articles/4402614652569-Do-VRoid-Studio-s-sample-models-come-with-conditions-of-use)。新版同名样本并非全部 CC0。
- 下载归档：[OpenGameArt VRoid Studio CC0 models](https://opengameart.org/content/vroid-studio-cc0-models)，`avatarsample_d_0.zip`。该页明确说明此旧版 D 与当前新版同名样本不同。
- MADO 修改：Blender 中压缩头发拓扑、控制贴图尺寸、保留 Smile/Blink 表情，客户端柔和 Toon 材质、普通校服配色变化和行走／回头／眨眼动画。
- `art/students.blend` 为可编辑源文件，`public/models/students.glb` 为运行资产，`art/prepare_avatar.py` 为复现脚本。
- 2026-09-09：`art/friend_hair.py` 在同一 CC0 基础上派生三款发型，新增发束、发结均为本项目 Blender 几何，保留原有脸部贴图与表情；未引入新的第三方素材。

## 上班族、普通路人与骑行者基础模型

- 作者：VRoid Project / pixiv Inc.
- 资产：`Sakurada Fumiriya.vrm`。
- 原作者许可：[Sakurada Fumiriya — CC0](https://vroid.pixiv.help/hc/en-us/articles/360014788554-Sakurada-Fumiriya)。
- 下载归档：同上 OpenGameArt 页面中的 `sakurada_fumiriya.zip`。
- MADO 修改：纹理预算、拓扑压缩、表情裁剪、低饱和衣发配色；独立步态、看表、提包及骑行 IK。与学生共用 `CharacterRig` 的光照和表情逻辑。
- `art/citizens.blend` 为可编辑源文件，`public/models/citizens.glb` 为运行资产；同一 `prepare_avatar.py` 脚本导出。

## 母女派生模型

- 同样基于上述旧版 CC0 `AvatarSample_D.vrm`，没有新增第三方来源。
- 母亲：日常衬衫、加长裙摆、发髻与遮挡裁剪；女孩：儿童身高和头身比、圆润脸型与放大的眼睛比例、宽松便服与小发束。保留独立骨骼、Smile/Blink。
- `art/family.py` 从已准备好的 `students.blend` 生成可编辑 `art/family.blend` 与运行资产 `public/models/family.glb`，并为街道整理通行空间。

除下列桌面和树木素材外，店铺、街道、桌面、自行车为本项目 Blender 几何。声音由本项目 Web Audio 合成，无第三方音频素材。项目没有使用《原神》的角色、游戏模型、贴图或音频。
# 2026-10-23 桌面与树木替换

- **Low Poly Arms (Rigged)**，作者 **DevMops**，许可 **CC0-1.0**。来源：https://opengameart.org/content/low-poly-arms-rigged 。原始文件 `art/vendor/arms.zip` 与 `.blend` 保留；采用其连续手掌/手指拓扑，移除原控制器，离线制作三指握笔与扶纸/握杯姿态、平滑一次，重新配色。没有把旧的分段手指模型保留在运行场景中。
- **Pen**，作者 **Poly by Google**，许可 **CC BY 3.0**，https://creativecommons.org/licenses/by/3.0/ 。模型来源：https://poly.pizza/m/c8-OE_JtLxV 。原始 `art/vendor/pen.glb` 保留；修改为适合书桌的大小、方向和笔尖位置。署名、许可与修改说明随离线场景分发。
- **Trees**，作者 **Quaternius**，许可 **CC0-1.0**（https://creativecommons.org/publicdomain/zero/1.0/）。来源：https://poly.pizza/m/etFGNvsiFv 。原始模型 `art/vendor/quaternius/etFGNvsiFv.glb` 保留；使用五种树的分枝结构，离线按叶片空间分布重建不透明树冠、重新配色并烘焙 AO。运行时不使用原始透明叶片，避免碎叶闪烁和透明排序开销。

网络下载的原始资源指纹记录于本轮验证目录 `sources/assets-manifest.json`。本说明亦随离线场景打包于 `THIRD_PARTY.md`；原始 IKO 工程与历史快照不改。

