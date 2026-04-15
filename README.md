# Youtube Shorts Blocker

YouTube Shortsの視聴を抑制するためのChrome拡張機能である．

## 目的

YouTube Shortsを開いたときに警告を表示し，Shortsを開いている間は5分おきに再度警告を表示する．

## 実現したい機能

- YouTube Shortsのページを開いたときに警告を表示する．
- YouTube Shortsを開いている間，5分おきに警告を表示する．
- YouTube内の画面遷移でShortsに移動した場合も警告を表示する．
- Shorts以外のYouTubeページでは警告を表示しない．

## 実装方針

Chrome拡張機能のcontent scriptをYouTubeページ上で実行し，現在のURLがShortsページかどうかを判定する．

Shortsページかどうかは，URLのパスが `/shorts/` から始まるかで判定する．

YouTubeはページ全体を再読み込みせずに画面遷移するため，初回読み込み時だけでなく，URL変更も監視する．

Shortsページに入ったときは即時に警告を表示し，Shortsページに滞在している間だけ5分間隔のタイマーを動かす．Shortsページから離れた場合は，タイマーを停止する．

## 開発方針

最初は `window.alert` を使って警告を表示する．

ただし，`window.alert` はブラウザ操作を一時停止するため，将来的にはページ内に独自の警告UIを表示する方式も検討する．

## 注意点

content scriptの対象URLをShortsページだけに限定すると，YouTube内の通常ページからShortsへ移動した場合に検知できない可能性がある．そのため，content scriptはYouTube全体を対象にし，JavaScript側でShortsページかどうかを判定する設計を基本方針とする．
