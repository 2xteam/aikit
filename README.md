# AIKit

AI에 넣은 사진과 프롬프트, 받은 결과 이미지를 **한 묶음으로** 모아 두는 앱.
myjane 계정을 함께 쓰는 서비스 가운데 일곱 번째다.

```
aikit.myjane.co.kr        로컬 3008 (검증 3018)
```

이미지 생성은 **하지 않는다.** 프롬프트를 쥐여 주고, 사용자가 각자의 AI에서 만든
결과를 되가져와 올리면 입력·프롬프트·결과를 한 화면에 붙들어 둔다.

## 시작하기

```bash
cp .env.example .env.local   # 값을 채운다
npm install
npm run dev                  # http://localhost:3008
```

점검 스크립트 —

```bash
npm run db:check    # MongoDB 연결과 DB 이름
npm run r2:check    # R2 토큰이 이 버킷에 읽고 쓸 수 있는지
```

## 알아 둘 것

- **이미지 저장소는 비공개다.** R2 객체 URL 을 밖으로 내보내지 않고 앱 라우트가
  세션을 확인한 뒤 스트리밍한다. 그래서 `R2_PUBLIC_URL` 이 없다
- **디자인은 만들지 않고 가져온다.** `app/palette.css` 와 `app/elements.css` 는
  포털(`C:\Dev\myjane`)에서 생성하는 파일이라 직접 고치지 않는다
- 회원과 세션은 포털이 발급한다. 로그인·가입·탈퇴 화면은 이 앱에 없다

자세한 배경과 함정은 [`CLAUDE.md`](./CLAUDE.md) 와 옵시디언 볼트에 있다.
