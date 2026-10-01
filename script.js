// ===== 長照問卷網站的所有行為邏輯都寫在這裡 =====

// 先抓到頁面上會用到的元素
var form = document.getElementById("surveyForm"); // 問卷表單
var formCard = document.getElementById("formCard"); // 問卷卡片（送出後要隱藏）
var lineCard = document.getElementById("lineCard"); // 加 LINE 的卡片（送出後要顯示）

// 當使用者按下「送出問卷」時執行
form.addEventListener("submit", function (event) {
  // 阻止表單預設行為（避免整頁重新整理）
  event.preventDefault();

  // 把表單資料整理成物件，方便之後存檔或查看
  var data = {
    name: form.name.value, // 稱呼
    phone: form.phone.value, // 電話
    age: form.age.value, // 年齡層
    ready: form.ready.value, // 是否已有長照保障
    topic: getCheckedTopics(), // 有興趣的主題（陣列）
    time: new Date().toLocaleString("zh-TW"), // 填寫時間
  };

  // 把這筆問卷存進瀏覽器（localStorage），方便現場回顧
  saveToLocal(data);

  // 隱藏問卷、顯示 LINE 加入卡片
  formCard.hidden = true;
  lineCard.hidden = false;

  // 畫面捲動到最上方，讓使用者看到感謝訊息
  window.scrollTo(0, 0);
});

// 取得所有被勾選的「主題」複選項目，回傳成陣列
function getCheckedTopics() {
  var list = [];
  // 找出所有 name 為 topic 且被勾選的核取方塊
  var boxes = document.querySelectorAll('input[name="topic"]:checked');
  for (var i = 0; i < boxes.length; i++) {
    list.push(boxes[i].value);
  }
  return list;
}

// 把問卷資料存到瀏覽器的 localStorage（累積成一個清單）
function saveToLocal(data) {
  // 先讀出舊的清單，沒有的話就用空陣列
  var saved = localStorage.getItem("surveyList");
  var listArray = saved ? JSON.parse(saved) : [];

  // 把這次的新資料加進去
  listArray.push(data);

  // 再存回瀏覽器
  localStorage.setItem("surveyList", JSON.stringify(listArray));
}
