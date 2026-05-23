import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "預約表單｜巽風堪輿研究中心",
  description: "巽風堪輿研究中心預約表單，協助建立服務需求並安排後續聯繫。"
};

export default function BookingPage() {
  return (
    <section className="hero">
      <div className="wrap">
        <div className="section-head">
          <div>
            <div className="tag">BOOKING FORM</div>
            <h1 className="hero-title">
              <span className="title-line title-main">預約表單</span>
              <span className="title-line accent">先釐清需求</span>
              <span className="title-line accent">再安排服務</span>
            </h1>
          </div>
          <p className="section-desc">
            請先填寫需求類型、地點、規模與希望安排時間，後續將依服務內容進行確認與回覆。
          </p>
        </div>
        <div className="grid-2">
          <article className="panel">
            <h2>預約流程</h2>
            <div className="process-list">
              <div className="process-item">
                <div className="num">1</div>
                <div>
                  <strong>選服務</strong>
                  <br />
                  陰陽宅、企業顧問、命名、擇日、八字或課程。
                </div>
              </div>
              <div className="process-item">
                <div className="num">2</div>
                <div>
                  <strong>填資訊</strong>
                  <br />
                  姓名、地點、坪數、預算、急迫性與需求背景。
                </div>
              </div>
              <div className="process-item">
                <div className="num">3</div>
                <div>
                  <strong>送出需求</strong>
                  <br />
                  送出需求或複製內容貼到 LINE。
                </div>
              </div>
              <div className="process-item">
                <div className="num">4</div>
                <div>
                  <strong>安排回覆</strong>
                  <br />
                  確認服務項目、時間、報價與後續流程。
                </div>
              </div>
            </div>
          </article>

          <div className="form-panel">
            <form id="bookingForm" className="booking-form" method="POST">
              <input
                type="text"
                name="_gotcha"
                tabIndex={-1}
                autoComplete="off"
                style={{ display: "none" }}
              />

              <div className="form-grid">
                <label>
                  服務類型
                  <select name="service" defaultValue="陰陽宅堪驗">
                    <option>陰陽宅堪驗</option>
                    <option>年度企業顧問</option>
                    <option>企業場域初勘</option>
                    <option>企業合作方案索取</option>
                    <option>新生兒取名</option>
                    <option>公司命名</option>
                    <option>成人改名</option>
                    <option>擇日選時</option>
                    <option>八字流年</option>
                    <option>課程 / 講座邀約</option>
                  </select>
                </label>
                <label>
                  姓名 / 單位
                  <input
                    type="text"
                    name="name"
                    placeholder="請填寫姓名、公司或組織名稱"
                  />
                </label>
                <label>
                  手機 / LINE
                  <input
                    type="text"
                    name="phone"
                    placeholder="可填手機、LINE ID 或兩者"
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    name="email"
                    placeholder="方便回覆的 Email"
                  />
                </label>
                <label>
                  地點 / 區域
                  <input
                    type="text"
                    name="location"
                    placeholder="例如：南投、台中、台北"
                  />
                </label>
                <label>
                  坪數 / 規模
                  <input
                    type="text"
                    name="size"
                    placeholder="例如：60 坪、單一店面、3 個據點"
                  />
                </label>
                <label>
                  預算級距
                  <select name="budget" defaultValue="尚未確定，先了解">
                    <option>尚未確定，先了解</option>
                    <option>3,600 輕顧問服務</option>
                    <option>22,000–28,000 陰陽宅堪驗</option>
                    <option>50,000–300,000 年度企業顧問</option>
                    <option>課程 / 講座另議</option>
                  </select>
                </label>
                <label>
                  需求急迫性
                  <select name="urgency" defaultValue="一般諮詢">
                    <option>一般諮詢</option>
                    <option>一週內希望確認</option>
                    <option>一個月內需完成</option>
                    <option>重大決策前需優先處理</option>
                  </select>
                </label>
              </div>
              <label>
                需求說明
                <textarea
                  name="message"
                  placeholder="請簡述需求背景、想處理的問題、預計時間或補充說明"
                ></textarea>
              </label>
              <label>
                希望安排時間
                <input
                  type="text"
                  name="schedule"
                  placeholder="例如：平日晚上、下週六、月底前"
                />
              </label>
              <div className="actions">
                <button className="btn btn-primary" type="submit">
                  送出預約表單
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  id="copyBookingBtn"
                >
                  複製內容給 LINE
                </button>
              </div>
              <div className="price-note">
                送出後系統會通知巽風堪輿研究中心；也可複製下方內容貼到 LINE 官方帳號，加速確認需求。
              </div>
              <div id="bookingPreview" className="booking-preview">
                正在準備預約內容…
              </div>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
