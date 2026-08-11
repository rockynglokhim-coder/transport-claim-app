# 車費 Claim App

手機優先的車費申請介面：GitHub Pages 負責前端、Google Identity Services 負責登入、Google Apps Script 驗證身份並讀寫指定 Google Sheet。

## 安全設計

- Google 密碼、Client Secret、API secret、access token、refresh token及憑證均不會放進 repository 或瀏覽器。
- Apps Script 後端會核對 Google ID token 的 audience、已驗證 email，以及 `Users` 表內的 Active 狀態。
- Claim 永遠綁定 Employee ID；email 只作登入識別。
- 前端不會直接讀取 Google Sheet。

## 啟用步驟

1. 在 Google Cloud 建立 OAuth 2.0「Web application」Client ID，加入 GitHub Pages 網址為 Authorized JavaScript origin。
2. 在 Apps Script 建立專案，加入 `apps-script/Code.gs` 與 `apps-script/appsscript.json`，把 `GOOGLE_CLIENT_ID` 換成同一個公開 Client ID。
3. 將 Apps Script 部署為 Web app：Execute as「Me」，Who has access「Anyone」。後端仍會驗證登入 token 與 Users allowlist。
4. 將 `config.js` 內兩個公開設定填妥並重新推送。

`config.example.js` 只示範可公開的設定；請勿加入任何 secret。

## 港鐵票價資料

- `mtr-fares.json` 使用港鐵官方成人八達通票價及行程 API。
- 執行 `ruby scripts/update-mtr-fares.rb` 可重新抓取機場快綫相關票價。
- 普通港鐵、機場快綫及 98 個可選車站的組合均有完整性檢查；中環／香港及尖沙咀／尖東會要求使用者選擇實際入閘及出閘站。
