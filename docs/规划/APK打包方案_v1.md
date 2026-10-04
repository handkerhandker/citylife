# 《云港小事》APK 打包方案 v1（给决策者过目）

> 题目：把现在这个网页版装进安卓手机（APK）。**本页只写方案与要装什么**；
> 装工具链前先经决策者点头（本机此前约定：装 Android SDK 前先问）。

## 一 · 结论先说

- **可行**，路线＝**Capacitor 壳**（把 HTML 与素材打进 App，离线优先）。
- 本机现状（2026-10-04 实测）：Node **v24.19.0** ✅、npm **11.17.0** ✅；
  **没有 Java、没有 Android SDK、没有 Gradle**；F 盘剩 **721GB**（装得下）。
- 要下载的东西合计约 **2–2.5GB**，**全部落 F 盘**（不占 C 盘）：

| 件 | 版本（2026-10-04 实测） | 大小 | 落位 |
|---|---|---|---|
| Temurin JDK 17 | 17.0.20.1+1（Adoptium 官方 API 实测） | 182MB | `F:\Android\jdk-17` |
| Android 命令行工具 | `commandlinetools-win-15859902_latest.zip`（developer.android.com 页面实测） | 约 150MB | `F:\Android\sdk\cmdline-tools\latest` |
| SDK 包（platform-tools／platforms;android-36／build-tools） | Capacitor 8 模板要求 compileSdk **36** | 约 1.5–2GB | `F:\Android\sdk` |
| Gradle 8.14.3 | Capacitor 8 模板的 wrapper 版本（实测） | 约 200MB | `F:\Android\gradle-home`（设 `GRADLE_USER_HOME`，**默认会落 C 盘，必须改**） |
| Capacitor 8.5.2 | npm 实测最新版（CLI 要求 Node ≥22 ✅） | 约 100MB | 项目内 `node_modules` |

**为什么不用 Android Studio**：命令行工具（sdkmanager）能装齐同样的 SDK，体积小得多、
也不用装 IDE；Capacitor 官方文档说明 Android Studio 只是"会替你装 JDK"的便利入口，
命令行这条路官方同样支持（页面实测 HTTP 200）。

## 二 · 打完包之后，AI 怎么走（关键设计）

- APK 里**不装任何密钥**。`/relay` 是相对路径，在 APK 里会指向 App 自己的本地地址 ——
  所以 APK 需要一个**可配置的"AI 中转地址"**（默认空＝纯模板兜底，零成本零风险）。
- 填上 EdgeOne 上那个中转站的完整地址（`https://<站点>/relay`）之后：
  AI 走向 ⇒ 中转站（限流／缓存／熔断在第 177 单已就位）⇒ DeepSeek。
- **不在本单部署中转站**（动线上要另点头）；不填地址的 APK 也能完整地玩（模板兜底）。

## 三 · 施工步骤（点头后照这个走）

1. 下载并解压 JDK 17 到 `F:\Android\jdk-17`；`java -version` 验一遍。
2. 解压命令行工具到 `F:\Android\sdk\cmdline-tools\latest`；
   `sdkmanager --licenses` 接受许可（写进 `F:\Android\sdk`）。
3. `sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"`。
4. 项目内 `npm i -D @capacitor/cli @capacitor/core @capacitor/android`（8.5.2）＋
   `npx cap init`（appId 例如 `com.yungang.citylife`）→ `npx cap add android`。
5. 把 `city-life-framework.html` 与素材拷进壳的 `www/`；`npx cap sync android`。
6. `set GRADLE_USER_HOME=F:\Android\gradle-home` →
   `cd android; gradlew.bat assembleDebug` ⇒ 产物 `android\app\build\outputs\apk\debug\app-debug.apk`。
7. 装到手机（数据线／或把 APK 拷进手机点安装）；按第四节验收。

## 四 · 验收计划（照《移动端移植要点》那份走）

- 真机：图标开机 → 现场页 → 点选/拖动 → 六页签 → 短信/加急 → 切前后台 → 返回键 →
  锁屏解锁 → 导出/导入存档 → 转屏（若允许）。
- 模板兜底：**飞行模式**走一遍——断网也能玩，AI 自动回退模板。
- 壳里壳外一致：同一份 HTML 在桌面浏览器再跑一遍现有 22 张巡查图＋五回归。
- 安全区：刘海／圆角／手势条不压字（`env(safe-area-inset-*)`）；Android 15+ 强制 edge-to-edge。

## 五 · 明确不做 / 已知代价

- 不把 DeepSeek 密钥打进 APK（宪法＋第 177 单口径）。
- APK 内置 HTML ⇒ 更新要重装（离线优先的代价；日后可另做"检查新版"）。
- 存档在 WebView 的 localStorage：**卸载即清**（已有导出/导入码可备份）。
- 先出 **debug 包**自用；要发给别人再另做 release 签名（keystore 落 F 盘、不进仓库）。
- 只在 Chromium/Android WebView 上验；iOS 不在本方案内。
