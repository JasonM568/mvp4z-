import { CourseLandingEditor } from "../_course-landing-editor";

export default function CourseLaunchPage() {
  return (
    <>
      <h1>課程上架</h1>
      <p className="lead">
        管理前台 <code>/courses</code> 招生頁的所有內容與報名商品。分七個步驟填寫，空白的區段前台會自動隱藏。
      </p>
      <CourseLandingEditor />
    </>
  );
}
