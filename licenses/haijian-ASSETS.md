# 资产与运行规范

## 原创范围

船、码头、船舱、舷窗、桌面、手、岛屿、飞机、海鸟、鲸鱼、8 种鱼、钓具与 SVG 图标均在本项目中制作。全部场景由实际几何加载，无整幅 AI 图片背景、下载模型或外部贴图。海面与天空为自编 shader；声音由 `src/audio.ts` 实时合成，没有采样商业作品。

这些资产随本项目交付，未附加第三方素材授权限制。依赖库仍遵循各自许可，见 `THIRD_PARTY.md`。参考 MADO 的空间与工程思路，未整套复制其模型、源码或品牌。

## 重建

Blender 3.5.1 已实际运行下列脚本；脚本清空新 Blender 进程的场景，并写入本项目的 blend、GLB 和报告。重建前保存手工编辑的 blend，脚本是资产的程序化版本。

```powershell
& 'D:\Blender3.5\blender-3.5.1-windows-x64\blender.exe' --background --python art/build_scene.py
```

- 编辑文件：`art/haijian.blend`，Blender Z-up，米制。
- 运行文件：`public/models/haijian.glb`，glTF Y-up，+Y 向上、-Z 指向窗外、+X 向右。
- 作者 helper 接收 Y-up 坐标并转换到 Blender；导出时恢复 glTF 标准坐标。
- 第三轮作者库：2,896 objects、301,221 vertices、35 materials；GLB 14,326,396 bytes，blend 37,106,424 bytes。作者顶点数不含导出时所有细分结果。静态网格按材质合批，作者物件数不等于 draw calls。
- 日常对象提前建池并复用；没有逐帧创建 Three.js mesh 或重复加载另一套海面。

## 结构和接触点

| 组或节点 | 用途 |
|---|---|
| Harbor / TicketBooth / ShipExterior | 微缩首页与靠岸码头 |
| Cabin / Desk / TeaCup / TurningPage | 第一人称船舱、杯子和翻页轴 |
| Hand_R / Hand_L / Grip_R / Grip_L | 双手与局部握持目标 |
| Joint_R/L / Thumb_R/L / Pinch_R/L | 各指三节层级、拇指和捏持目标；运行时名称含手指编号 |
| Pen | 书写工具，手腕按笔的位置求解 |
| FishingDeck / FishingRod / Bobber | 甲板、鱼竿、浮漂 |
| RodGrip / ReelHandle / CrankGrip / RodTip | 主握点、摇柄轴、摇柄握点、线起点 |
| Fish_0…7 / FishTail_0…7 / FishMouth_0…7 | 各鱼真实几何、尾轴与鱼线连接 |
| Island_0…2 / Seabird / Aircraft / Whale | 远近岛与复用事件实体 |

静态 Blender 模型没有烘焙动作片段；运行时动画见 `SeaWorld.updateHands / updateFishing / updateEvents` 和 `src/hands.ts`。手指使用普通 Group 关节层级，按动作调整各节角度，局部握点在 world space 求解；它不是 SkinnedMesh 或骨骼 IK。前臂沿独立三次曲线路径更新，桌面安全高度约束避免袖子下穿。杯柄接触、放笔和取笔各有明确先后阶段，翻页时右手离开纸面。竿尖连接动态鱼线，左侧摇柄连续旋转，提前放流从当时鱼的位置继续。

第三轮手部局部方向：手背 +Y，掌心 -Y，指尖朝 -Z，左拇指 +X、右拇指 -X。端杯时杯组绕 Y 转 π，左手绕 Z 转 π/2，使掌心朝杯、拇指向上；前臂第一条切线沿手腕局部 +Z。钓竿双手也采用拇指向上的相对握姿。连续手掌和杯壁均检查面绕序，避免内向法线产生条纹。

鲸鱼模型本体约 7.3 米长，运行时缩放 2.15 倍，体长约 15.7 米；事件根节点距座位前方 32–40 米。胸鳍与尾鳍由截面曲面构成，保留独立动画轴，喷水和落水圈按当前尺寸匹配。树冠由不规则连续曲面与叶簇组成，替换重复球堆；新增坡地步道和海岬岩层。

海面与程序云层在 `src/seascape.ts`，`src/ocean.ts` 保留兼容导出。近水透明度随距离与视角变化，水下有海床和稀疏游鱼；均衡/高清使用 Three.js Reflector 的真实平面倒影，省电关闭倒影渲染并使用解析天空反光。波纹、焦散效果和星空为风格化 shader，不是光线追踪或物理折射。`src/materials.ts` 提供木纹、皮肤、织物及鲸鱼斑纹；树冠与草地含顶点颜色。鲸鱼喷水从 Blowhole 的世界位置发出。漂航与事件分别在 world.ts / ambient.ts。

## 画质预算

| 档位 | 帧率上限 | 像素预算 | 阴影与粒子 |
|---|---|---|---|
| 省电 | 30 | 约 140 万、DPR ≤ 1 | 无阴影/倒影渲染；130 雨粒；少事件 |
| 均衡 | 60 | 约 260 万、DPR ≤ 1.5 | 1024 阴影；768 倒影；270 雨粒 |
| 高清 | 60 | 约 500 万、DPR ≤ 2 | 2048 阴影；768 倒影；480 雨粒 |
| 自动 | 按窗口选择；持续低帧率降省电 | 跟随所选档位 | 低于 25 FPS 连续三个观察窗口降档 |

减少动态关闭装饰事件与镜头漂浮，雨粒降至 40。帧率上限是目标，不是所有设备的保证。手机的真实帧率、热量和 1–3 小时耗电需要后续真机测试。
