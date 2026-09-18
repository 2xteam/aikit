import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AIKit",
    short_name: "AIKit",
    description: "입력 사진 · 프롬프트 · 결과 이미지를 한 묶음으로 남기는 AIKit",
    start_url: "/home",
    display: "standalone",
    /* 라이트 전용이므로 첫 페인트 색을 globals.css 의 :root 와 같게 둔다 */
    background_color: "#f7fbfb",
    theme_color: "#116271",
    orientation: "portrait",
    icons: [{ src: "/icon.png", sizes: "192x192", type: "image/png" }],
  };
}
