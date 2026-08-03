/* 部署時的預設設定。
 *
 * clientId 留空也能用 —— 打開網頁後在「設定」裡填，會存在瀏覽器 localStorage。
 * 想讓每個開這個網址的人都不用自己填，就把 clientId 寫進來一起部署。
 * （OAuth 用戶端 ID 本來就會出現在前端流量裡，不是祕密；真正的保護是
 *   Google Cloud 憑證上的「已授權的 JavaScript 來源」白名單。）
 *
 * 使用者在設定裡自己填的值，優先於這裡的預設值。
 */
window.ROTARY_MAIL_CONFIG = {
  clientId: "",                              // 例："123456789-abc.apps.googleusercontent.com"
  hint: "rctpedaylight0303@gmail.com",       // 登入時預先帶入的 Gmail 帳號
};
