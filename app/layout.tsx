import type { Metadata } from "next";
import "./globals.css";
// globals.css **다음 줄**이라야 한다 — .sheet--point 가 특이도 같은
// .sheet { border-radius: var(--radius-lg) } 를 이겨야 한다.
// 생성 파일이다: myjane/design/elements.css → npm run elements -- --write
import "./elements.css";

export const metadata: Metadata = {
  title: "AIKit",
  description:
    "AI에 넣은 사진과 프롬프트, 받은 결과 이미지를 한 묶음으로 모아 두는 프롬프트 기록",
  icons: {
    /**
     * 16px 은 단순화한 별도 그림이다. 브라우저가 크기별로 골라 쓴다 —
     * 목록에 sizes 를 안 적으면 큰 쪽을 줄여 쓰면서 회색 덩어리가 된다.
     * → public/app-icon-16.svg
     */
    icon: [
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/icon.png",
  },
  manifest: "/manifest.webmanifest",
  /**
   * 링크를 붙였을 때 보이는 미리보기.
   *
   * ⚠️ 공유 링크(`/s/<token>`)는 **여기 값을 쓰면 안 된다.** 공유는 고른 이미지만
   * 내보내는 자리라, 미리보기가 묶음의 다른 이미지를 집어 가면 끄기가 실제로
   * 먹지 않는다. 그 화면은 자기 metadata 를 따로 갖고 `noindex` 다.
   * → my-obsidian-vault / 50-Plans/H AIKit 구축.md
   */
  openGraph: {
    type: "website",
    siteName: "AIKit",
    title: "AIKit — 프롬프트와 결과를 한 묶음으로",
    description:
      "넣은 사진 · 쓴 프롬프트 · 받은 이미지를 함께 남겨요. 두 달 뒤에도 그대로 찾아 써요.",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        {/*
          결쩜사와 동일한 서체 조합.
          본문·라벨은 Pretendard, 큰 헤드라인은 Gowun Batang(명조) 700.
          시스템 폰트 스택으로 대체하면 색을 맞춰도 다른 사이트처럼 보인다.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.min.css"
        />
        <meta name="apple-mobile-web-app-title" content="AIKit" />
      </head>
      <body>{children}</body>
    </html>
  );
}
