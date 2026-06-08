# 法语拾音

Chrome 扩展：划选文本自动翻译、朗读，并在学习语言为法语时显示 IPA 音标。

## 安装

1. 打开 Chrome 的 `chrome://extensions/`。
2. 打开右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择当前项目文件夹。

## 功能

- 点击扩展图标可配置学习语言、学习语 TTS 声音和中文 TTS 声音。
- 点击“翻译”时，中文翻译成当前学习语言，其他文本翻译成中文。
- 点击“朗读”时，中文使用中文 TTS 配置，其他文本使用学习语 TTS 配置。
- 若浏览器没有目标语言的匹配 TTS 声音，朗读会提示安装对应语音包，不会回退到其他语言声音。
- 学习语言为法语时，划选法语单词会自动查询 IPA 音标。
- 语速滑块默认 `0.8`，可在悬浮框中直接调整。

## 项目结构

```text
manifest.json
src/
  background.js
  shared/
    settings.js
  popup/
    popup.html
    popup.css
    popup.js
  content/
    config.js
    api.js
    speech.js
    tooltip.js
    main.js
```

- `src/shared/settings.js`：统一管理语言预设、默认配置和 `chrome.storage.local` 读写。
- `src/popup/`：扩展图标弹出的语言与 TTS 设置页。
- `src/content/config.js`：统一管理内容脚本常量、正则和运行时配置。
- `src/content/api.js`：负责翻译和 Wiktionary 音标请求。
- `src/content/speech.js`：负责按配置选择浏览器 TTS voice 并朗读。
- `src/content/tooltip.js`：只负责悬浮框 DOM、样式和 UI 状态。
- `src/content/main.js`：负责选区监听、实例生命周期、朗读和防重复注入。
- `src/background.js`：作为 Manifest V3 service worker 代理跨域请求。

## 稳定性设计

- 每次 content script 注入前都会调用上一实例的 `cleanup`，移除旧监听和旧悬浮框。
- 悬浮框使用固定 `id`，页面中只允许存在一个当前版本悬浮框。
- 对历史版本残留的匿名监听无法直接卸载，因此新版会在显示悬浮框后分时清理旧版残留浮窗。
- 音标请求带有请求序号，避免慢请求覆盖新选区的结果。
