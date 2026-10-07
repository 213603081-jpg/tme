# 歌单与交互约定

18 首独立歌曲，9 个自定义歌单，只有歌单使用封面。原始素材保持不变，MP4 不纳入。
封面为用户提供的个人歌单配图，不代表图片所示官方专辑的曲目。

## 交互

- 墙上唱片架与柜子下方的唱片都代表个人主页歌单。
- 柜子支持滑动浏览歌单封面。
- 点击歌单仅打开歌曲列表浮层，不立即播放或换片。
- 浮层按钮文案为“播放”；点击后才执行换片动画并播放该歌单。
- 歌单内顺序以 catalog.json 的 trackIds 为准；歌曲可在多个歌单中引用同一音频。
- 唱片架展示 9 个不重复封面，排除红色 Drama，保留一格空架；柜内交互暂不启用。点击“播放”才启动换片。

## 歌单

### 霓虹开场（墙上，5 首）

- aespa — Rich Man
- aespa — Whiplash
- aespa — Drama
- aespa — Girls
- aespa — Armageddon

### 夏日气泡（墙上，5 首）

- TWICE — Happy Happy
- TWICE — Cheer Up
- TWICE — Heart Shaker
- aespa — Spicy
- aespa — LEMONADE

### 心动循环（墙上，5 首）

- TWICE — The Feels
- TWICE — Feel Special
- TWICE — CANDY
- TWICE — Conversation
- TWICE — MORE & MORE

### 未来来信（墙上，4 首）

- aespa — Next Level
- aespa — Black Mamba
- aespa — Armageddon
- aespa — Girls

### 城市漫游（墙上，6 首）

- aespa — Whiplash
- TWICE — Conversation
- aespa — LEMONADE
- TWICE — The Feels
- TWICE — One More Time
- aespa — Next Level

### 好心情收集册（墙上，6 首）

- TWICE — Cheer Up
- TWICE — Happy Happy
- TWICE — Heart Shaker
- TWICE — One More Time
- TWICE — CANDY
- TWICE — Feel Special

### 主场时刻（墙上，5 首）

- aespa — Drama
- aespa — Rich Man
- aespa — Spicy
- aespa — Black Mamba
- TWICE — MORE & MORE

### 我的反复播放（墙上，12 首）

- aespa — Whiplash
- TWICE — The Feels
- aespa — Drama
- TWICE — Feel Special
- aespa — Next Level
- TWICE — Cheer Up
- aespa — Armageddon
- TWICE — Heart Shaker
- aespa — LEMONADE
- TWICE — Conversation
- aespa — Spicy
- TWICE — CANDY

### 声音实验室（墙上，5 首）

- aespa — Next Level
- aespa — Girls
- aespa — Armageddon
- TWICE — MORE & MORE
- TWICE — Conversation

## 最新交互（2026-10-04）

全部 22 张封面可用。唱片架固定 8 格（左右各 4 格），默认余下 14 张归柜子。弹窗使用“收起／陈列”，满位选择替换，取消不改位置，支持撤销和本地保存。移动不改变播放器。柜内点击推近、横向拖动翻片、点击查看歌单。

柜内翻阅已改为使用 GLB 原有 LeftAlbumCard_05.001–010 实体网格。封面附着原模型正反面，侧面取封面平均色；抽出后转正，退出近景归位。超过 10 张的歌单通过滑动窗口依次映射到原模型，不额外生成替代唱片。

柜内现改为每个收纳歌单一张独立实体：复用原 GLB 唱片几何并按数量排布，不再使用 10 槽位轮换。正反封面与书脊配图，滑动抽出当前唱片、邻片让位。总计 22 张，默认架上 8／柜内 14，收起后数量同步。

参考录屏后，柜内翻阅改为底边固定在柜板高度 y=0.287m、两侧扇形翻动；封套尺寸 0.30m，展开范围限制在 0.54m 柜格内，取消远距离抽出和上浮。
