# 紙嶼 NoteIsle

紙嶼是本機執行的多帳號筆記展示應用。註冊、登入、帳號角色、筆記及資料夾都存在執行 Next.js 的這台電腦之 SQLite 資料庫；不需要 Supabase、雲端帳號或網路服務。

## 使用下載版（Windows）

Windows 64 位元使用者不必另外安裝 Node.js、npm 或資料庫。從 GitHub 專案的 **Releases** 下載 `NoteIsle-版本-Windows-portable.exe`，直接開啟即可；第一次啟動後，在畫面選擇「建立帳號」。首次註冊的帳號會成為該電腦資料庫的管理員。目前的預覽發行檔尚未數位簽署，Windows 可能顯示 SmartScreen 警告；只執行你信任來源所提供的檔案。

帳號及筆記保存在目前 Windows 使用者的 `%APPDATA%\NoteIsle\noteisle.sqlite`，不會放進下載檔或專案目錄。移除下載檔不會刪除筆記；要備份時，先關閉紙嶼，再複製 `%APPDATA%\NoteIsle` 資料夾。

這是每台電腦各自保存資料的桌面程式。不同電腦下載後不會共用帳號或筆記；跨裝置共用仍需要部署中央伺服器，不能只靠 GitHub Releases 或靜態 GitHub Pages。

## 從原始碼執行

需求：Node.js 22 以上與 npm。Windows 從原始碼安裝時，SQLite 原生模組需要 Python 3 及 Visual Studio C++ Build Tools。

```bash
npm install
npm run dev
```

開啟 `http://localhost:3000`，選擇「建立帳號」註冊。密碼需 8–128 個字元，伺服器使用 Node.js scrypt 雜湊後才寫入資料庫。第一個建立的帳號會成為管理員，其後註冊的帳號為一般使用者。桌面支援 `Ctrl/Cmd+N` 新增筆記及 `Ctrl/Cmd+K` 搜尋。

SQLite 資料庫預設建立在專案根目錄 `.data/noteisle.sqlite`，該目錄已加入 Git 忽略清單。也可透過 `NOTEISLE_DB_PATH` 指定資料庫檔案位置。停止伺服器後，備份整個 `.data` 目錄即可保留帳號與筆記。

## 本機帳號與管理員

- 每個帳號只能讀寫自己的筆記與資料夾；伺服器依 HttpOnly session cookie 確認登入者，不接受瀏覽器自行指定帳號 ID。
- 管理員可從工作區左下方的「管理員」進入帳號列表，並授予或移除其他帳號的管理員角色。
- 管理員列表不會顯示筆記內容；至少保留一位管理員，也不能由管理員在介面中變更自己的角色。
- 管理員權限只在這個本機 SQLite 資料庫內有效；它不是作業系統管理員權限。
- 本機帳號沒有郵件服務，因此沒有郵件驗證或忘記密碼連結。請保管好密碼並備份 `.data` 資料庫。

這是供本機展示的單機伺服器，不是對外公開的多人雲端服務。其他使用者只有在能連到同一台執行中的伺服器時，才能登入該伺服器建立的帳號；不要將本機伺服器或 SQLite 資料庫直接暴露到公用網路。正式多人服務仍需另行部署具備備份、監控、TLS 和正式身分驗證管理的後端。

## 目前功能

- 本機多帳號註冊、登入、登出與角色管理。
- 每位帳號獨立保存筆記及資料夾至 SQLite。
- 筆記建立、編輯、自動儲存、置頂、收藏、封存、垃圾桶、還原與永久刪除。
- 資料夾、標籤、標題與正文搜尋。
- Markdown 編輯、GFM 預覽、Markdown 匯入與單篇／完整 JSON 匯出。
- 響應式桌機與手機工作區。

雲端同步、跨網路帳號服務、即時協作、多人共編、唯讀分享、附件及離線同步佇列尚未實作。

## 測試

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:e2e
npm run test:a11y
npm run test:ci
```

第一次執行 E2E 前安裝 Playwright Chromium：

```bash
npx playwright install chromium
```

測試涵蓋筆記領域規則、登入及註冊、SQLite 使用者資料隔離、桌機／手機流程與 axe WCAG 掃描。使用合成測試帳號，不連接正式使用者資料。更多測試原則與案例見 [`TESTING.md`](TESTING.md)。

## 版本控制

此專案已包含 Git 儲存庫。若要放到自己的 GitHub：

1. 在 GitHub 建立一個空白 repository；不要勾選新增 README、`.gitignore` 或 License。
2. 在專案資料夾執行下列命令，將 `<你的帳號>` 和 `<repository>` 換成 GitHub 使用者名稱與儲存庫名稱：

   ```bash
   git remote add origin https://github.com/<你的帳號>/<repository>.git
   git add -A
   git commit -m "Prepare NoteIsle local desktop app"
   git branch -M main
   git push -u origin main
   ```

   GitHub 會要求使用瀏覽器登入或使用已設定的 Git 認證；不要將密碼或 token 寫入程式碼或命令。
3. 推送版本標籤，GitHub Actions 就會自動建置 Windows 免安裝版並建立 Release：

   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

   建置完成後，在 GitHub repository 的 **Releases** 頁面即可下載 `.exe`。之後每次發布請使用新的版本標籤。

若要自行在 64 位元 Windows 建置下載檔，需安裝 Node.js 24、npm、Python 3 及 Visual Studio C++ Build Tools，然後執行 `npm ci` 和 `npm run desktop:build`；成品會放在 `release` 資料夾。一般下載者不需要執行這些開發命令。

不要提交 `.data`、`.desktop-build`、`release`、帳號密碼、資料庫檔案或真實筆記內容。
