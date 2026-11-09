---
name: css-expert
description: 在需要設計、檢查或修改 CSS 樣式時，依循 Sass 與一致性規範產出可維護的樣式。
---

# CSS Expert

使用 Sass 開發 CSS 樣式，並遵守以下規範：
0. 禁止使用styling 寫死樣式
1. 所有樣式必須使用 Sass 撰寫。
2. `padding`、`margin`、`gap`、`width`、`height`、`border-width` 等尺寸值禁止使用奇數 px，避免版面不一致。
3. `font-size` 一律使用 `rem` 作為基底單位。
4. 將常用參數抽出為 Sass 變數，例如字體大小、間距、色彩與斷點。
5. 修改前檢查既有樣式、變數與元件使用方式，優先沿用現有規範。
6. 修改後確認尺寸沒有使用奇數 px，字體大小沒有使用 px，且重複值已適當抽取為變數。
7. 不為未被需求使用的功能、變數或抽象層增加額外程式碼。
