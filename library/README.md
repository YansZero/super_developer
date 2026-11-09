# Super Developer Library

此目錄為 Super Developer 統一管理的本機中央資源庫：

- `skills/`：自訂與納管之 Skill 集合（各 Skill 資料夾包含 `SKILL.md` 及附屬腳本／參考文件）。此目錄已由 `.gitignore` 排除。
- `mcps/`：自訂與納管之 MCP Server 規格定義（JSON）及本機機密與備份。此目錄已由 `.gitignore` 排除。
- `prompt/`：可提交的多語系 Prompt 範本，例如 `ai-project-analysis_{zhTW|en|es}.md`；由 AI 分析頁依目前語系載入，使用者可直接修改後重新上傳或套用。

所有 Skill 與 MCP 的建立、修改、刪除、AI 草稿產生及 Target 安裝狀態，均透過 Super Developer 控制台統一操作。
