# Pet Factory 独立桌面宠物

这是一个完全独立运行的 Tauri 2 桌面应用，不需要安装或启动 Codex。应用会自动发现仓库根目录 `pets/` 下的 hatch-pet v2 资源，并将所有角色打包进透明、无边框、始终置顶的小窗口。

## 已实现功能

- 透明、无边框、固定 `192 × 208` 的置顶窗口
- 鼠标左键拖动；松开后限制在当前显示器工作区内，靠近左右边缘时自动吸附
- 自动保存最后停留位置，多显示器切换后会重新限制到可见工作区
- 完整支持 hatch-pet v2 的 `8 × 11` 图集
- 打包或开发启动时自动发现 `pets/*/pet.json` 与 `spritesheet.webp`，当前内置 Rosie Haimei、奶霜、奶糖、雪团、Raven Voyager、Siuu Star
- 系统托盘菜单：显示、隐藏、鼠标穿透、切换宠物、播放动画、退出
- 从托盘“切换宠物”选择角色后立即更换图集，不需要退出、重新打包或连接 Codex
- 保存上次选择的宠物和窗口位置，下次启动自动恢复
- 待机 `7–15` 秒后随机播放挥手、环顾或等待，并在动作结束后回到待机
- 拖动期间播放对应方向的移动动画；松开后短暂完成移动再回到待机
- 鼠标在宠物附近的横向感应区内左右移动时，宠物会朝同方向小跑一小段；远离宠物时不会响应，避免干扰正常桌面操作
- 鼠标穿透开启后，必须从系统托盘取消
- 双击宠物播放挥手动画；托盘仍可手动播放工作中、成功、出错、检查等状态
- 遵循系统“减少动态效果”设置；开启时显示静态首帧
- 关闭事件转为隐藏，只有托盘“退出”会真正结束进程

## 动画映射

图集尺寸为 `1536 × 2288`，单帧为 `192 × 208`。

| 行 | hatch-pet 状态 | 应用中的名称 | 帧数 |
| --- | --- | --- | --- |
| 0 | `idle` | 待机 | 6 |
| 1 | `running-right` | 向右移动 | 8 |
| 2 | `running-left` | 向左移动 | 8 |
| 3 | `waving` | 挥手 | 4 |
| 4 | `jumping` | 成功 | 5 |
| 5 | `failed` | 出错 | 8 |
| 6 | `waiting` | 等待 | 6 |
| 7 | `running` | 工作中 | 6 |
| 8 | `review` | 检查 | 6 |
| 9–10 | v2 look directions | 环顾 | 16 |

`success`、`error`、`working` 是独立应用提供的语义别名，分别使用原图集的 `jumping`、`failed`、`running` 行，没有重绘任何帧。

## 使用方式

1. 启动应用后，在 macOS 菜单栏或 Windows 通知区域找到 Pet Factory 图标。
2. 打开“切换宠物”，选择任意内置角色；宠物会立刻换图，并在下次启动时保持该选择。
3. 打开“播放动画”可手动预览待机、工作中、成功、出错、等待、检查、挥手和环顾。
4. 不操作时，宠物会定时随机做出挥手、环顾或等待动作；双击宠物也会挥手。
5. 在宠物附近沿水平方向移动鼠标，可引导它向左或向右小跑；开启系统“减少动态效果”时会停用该效果。

“无需重新打包”指的是在已安装版本中切换已内置的角色。向 `pets/` 新增角色后，需要执行一次开发运行或打包，才能把它加入随后生成的安装包。

## 项目结构

```text
pet_factory/
├── index.html
├── package.json
├── public/assets/
│   ├── pet.json
│   └── spritesheet.webp
├── src/
│   ├── main.ts
│   ├── pet-atlas.ts
│   └── style.css
└── src-tauri/
    ├── capabilities/default.json
    ├── icons/
    ├── src/lib.rs
    ├── src/main.rs
    ├── Cargo.toml
    └── tauri.conf.json
```

## 开发环境

需要：

- Node.js 20 或更新版本
- Rust stable
- 当前平台的 Tauri 系统依赖

macOS 需要 Xcode Command Line Tools；Windows 需要 Microsoft C++ Build Tools 和 WebView2；Linux 需要 WebKitGTK 4.1 等发行版依赖。完整清单见 [Tauri 官方前置依赖文档](https://v2.tauri.app/start/prerequisites/)。

安装 JavaScript 依赖：

```bash
npm install
```

开发运行：

```bash
npm run desktop:dev
```

只检查和构建前端：

```bash
npm run build
```

检查 Rust：

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

## 打包

在目标系统上执行：

```bash
npm run desktop:build
```

Tauri 会在 `src-tauri/target/release/bundle/` 中生成当前系统的安装包。推荐分别在 macOS、Windows 和 Linux 上原生构建；跨平台编译的系统依赖和签名限制更多。

### macOS

构建 `.app`：

```bash
npm run desktop:build -- --bundles app
```

构建 `.dmg`：

```bash
npm run desktop:build -- --bundles dmg
```

透明 WebView 依赖 `macOSPrivateApi`。这满足桌面宠物的透明背景要求，但使用该私有 API 的构建不能提交到 Mac App Store；适合签名、公证后通过 `.dmg` 直接分发。签名与公证配置见 [Tauri macOS 分发文档](https://v2.tauri.app/distribute/macos-application-bundle/)。

没有 Apple Developer 证书、只做本机测试时，可对 `.app` 做 ad-hoc 签名：

```bash
codesign --force --deep --sign - \
  "src-tauri/target/release/bundle/macos/Pet Factory.app"
```

ad-hoc 签名不是正式发行签名，也不能替代 Apple 公证。当前仓库内生成的测试包已做 ad-hoc 签名，并通过 `codesign --verify --deep --strict`；对外发布前仍应配置你的 Developer ID。

如果无图形界面的 CI 环境无法运行 Tauri 的 Finder DMG 美化脚本，可从已签名的 `.app` 创建基础镜像：

```bash
hdiutil create -volname "Rosie Haimei" \
  -srcfolder "src-tauri/target/release/bundle/macos/Pet Factory.app" \
  -ov -format UDZO \
  "src-tauri/target/release/bundle/dmg/Pet Factory_1.0.0_aarch64.dmg"
```

### Windows

```powershell
npm run desktop:build
```

默认生成 NSIS 安装程序和/或 MSI（取决于本机工具链和 `bundle.targets`）。配置已使用 WebView2 下载引导程序。正式分发前应配置代码签名，详见 [Tauri Windows 安装包文档](https://v2.tauri.app/distribute/windows-installer/)。

### Linux

```bash
npm run desktop:build
```

可生成 AppImage、Deb 或 RPM 等当前环境支持的格式。为了兼容较老发行版，应在计划支持的最老基础系统上构建；详见 [Tauri AppImage 文档](https://v2.tauri.app/distribute/appimage/)。部分 Wayland 合成器对始终置顶、透明窗口和托盘的支持可能因桌面环境而异。

## 更换宠物资源

1. 在仓库根目录创建 `pets/<pet-id>/`，放入 `pet.json` 和 `spritesheet.webp`。`pet.json` 的 `id` 必须等于目录名，且 `spriteVersionNumber` 必须为 `2`。
2. 开发时执行 `npm run desktop:dev`，或打包时执行 `npm run desktop:build`；脚本会自动生成应用内部目录并同步托盘菜单。
3. 如果图集不是 hatch-pet v2 的 `1536 × 2288 / 8 × 11` 合约，更新 `src/pet-atlas.ts` 和窗口尺寸后再接入。
4. 如需更换应用图标，重新生成图标：

   ```bash
   npm run tauri -- icon src-tauri/icons/icon-source.png
   ```

5. 重新执行 `npm run desktop:build`。

应用不会连接 Codex、OpenAI API 或任何远程服务，运行时只加载打包在本地的资源。重新分发宠物美术素材前，请自行确认相应使用权。
