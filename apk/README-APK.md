# 云港小事 · APK 壳（Capacitor）—— **已出包**

**最近一次成功打包**：2026-10-04，产物 `out\citylife-debug.apk`（4.43MB，内含游戏 v144；
装机包另拷一份到 `F:\资料\codex\云港小事\outputs\citylife-debug.apk`）。
包信息（aapt2 实测）：`com.yungang.citylife` · minSdk 24 · target/compileSdk 36 · 名称「云港小事」。

这个目录是**打包用的壳**，不属于游戏仓库（`..\citylife`）——游戏仓库保持干净，
壳只负责"把成品塞进安卓工程、跑 Gradle、产出 APK"。

## 一次性的工具链（待决策者点头后安装，全部落 F 盘）

## 实际装成的工具链（2026-10-04 实测记录，含踩坑）

| 件 | 位置 | 说明 |
|---|---|---|
| Temurin **JDK 21** | `F:\Android\jdk-21` | **必须 21**：Capacitor 8 的安卓库 `sourceCompatibility JavaVersion.VERSION_21`，用 17 编不过（实测报"无效的源发行版: 21"）。JDK 17 也在 `F:\Android\jdk-17`（留作备用） |
| Android 命令行工具 | `F:\Android\sdk\cmdline-tools\latest` | `commandlinetools-win-15859902_latest.zip` |
| SDK 包 | `F:\Android\sdk` | `sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"` |
| Gradle 用户目录 | `F:\Android\gradle-home` | 环境变量 `GRADLE_USER_HOME`（**不改它会落 C 盘**） |
| Gradle 分发 | 由 wrapper 拉取 | 官方站太慢（实测 44KB/s）⇒ `gradle-wrapper.properties` 已改**腾讯云镜像**（实测 15MB/s） |

**三个必须记住的坑（都在 `build-apk.bat` 里处理好了）**：

1. **工程目录不许带中文/空格** —— AGP 直接拒绝（`Your project path contains non-ASCII characters`）。
   故本壳放在 `F:\codex\citylife-apk`（纯 ASCII）；游戏仓库仍在中文路径下（读它没问题）。
2. **Codex 桌面端的沙箱会打断 JVM 的 AF_UNIX 自管道** —— 症状是
   `java.io.IOException: Unable to establish loopback connection`（Codex 官方 issue #40902；
   本机装的两个 JDK 都复现）。解法（社区实测、本机复验通过）：
   `set JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:\Windows\Temp`。
   在 Codex 外面用普通 PowerShell 跑则不需要这一条。
3. **`.bat` 必须 CRLF + 纯 ASCII** —— LF 换行的 .bat 会被 cmd 拆成乱码执行（本单第一版实测）。

## 打包

双击 `build-apk.bat`（纯 ASCII + CRLF，cmd 可直接跑），或手动：

```powershell
cd F:\资料\codex\云港小事\apk-shell
node sync-www.cjs
npx cap sync android
cd android; .\gradlew.bat assembleDebug
```

产物：`android\app\build\outputs\apk\debug\app-debug.apk`，`build-apk.bat` 会顺手拷到
`out\citylife-debug.apk`（ASCII 路径）；要给决策者的那份再拷到
`F:\资料\codex\云港小事\outputs\`。

## 已定的事

- 壳版本：Capacitor **8.5.2**（npm 实测最新）；安卓模板 compileSdk/targetSdk **36**、minSdk **24**、Gradle **8.14.3**、AGP **8.13.0**（全部实测自官方模板）。
- `www/` 由 `sync-www.cjs` 从游戏仓库拷：`index.html`（即 `city-life-framework.html`）＋ `assets/`（两张图，0.1MB）。
- **APK 里不放任何密钥**；壳里 `/relay` 是相对路径 ⇒ 在 App 里指向它自己（连不上）⇒
  **AI 自动走模板兜底**（断网照样完整可玩）。要让 App 用上 AI，需要下一单加
  「AI 中转地址」设置项（把地址指到站点上的 `/relay`）——见 `docs\规划\APK打包方案_v1.md`。
