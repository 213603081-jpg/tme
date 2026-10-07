# QQ音乐 3D 音乐空间

QQ音乐个人主页改版 + 3D 唱片架装扮的演示项目。个人主页作为首页入口，点击「进入3D空间」即可进入可自由装扮的 3D 音乐房间。

## 功能

**个人主页（首页）**
- 用户信息卡片、会员中心、功能入口（收藏/本地/有声/已购）
- 最近播放列表
- 底部播放器 + 底部导航（首页 / 视频 / 刷歌 / 星光 / 我的）
- 唱片架页面（个人资料、勋章、歌单、3D 空间入口）

**3D 音乐空间**
- 固定相机位置、仅旋转视角（防穿墙，桌面/手机双适配）
- 墙面 / 地板 / 柜子 / 唱片 / 海报 / 氛围的装扮
- 唱片盘面支持贴图库（黑色原始 + 流光 + 用户上传光效）
- 液态玻璃 UI 控制面板
- 白底黑胶旋转加载动画（QQ音乐主题色）

## 技术栈

- [Vite](https://vitejs.dev/) + React 18 + TypeScript
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) + drei + [three.js](https://threejs.org/)
- 3D 模型：GLB（`public/room.glb`）

## 目录结构

```
├── public/
│   ├── room.glb               # 3D 音乐房间模型
│   └── textures/              # 装扮贴图素材（墙面/地板/唱片等）
├── src/
│   ├── pages/
│   │   ├── ProfilePage.tsx    # QQ音乐个人主页（首页）
│   │   └── ProfilePage.css    # 个人主页样式
│   ├── App.tsx                # 视图切换（主页 <-> 3D 空间）
│   ├── Scene.tsx              # 3D 房间场景与装扮逻辑
│   ├── UIOverlay.tsx          # 3D 装扮控制面板
│   ├── Music.tsx              # 背景音乐控制
│   ├── CameraView.tsx         # 相机视角（桌面/手机适配）
│   └── main.tsx               # 入口
└── package.json
```

## 运行

```bash
npm install
npm run dev
```

浏览器打开 `http://localhost:5173`（局域网访问见终端输出的 Network 地址）。

## 视图切换

`App.tsx` 维护 `view` 状态：`'profile'`（个人主页）↔ `'room3d'`（3D 空间）。
个人主页通过「进入3D空间 / 我的3D音乐空间」入口调用 `onEnter3D` 切换到 3D；3D 空间左上角「‹ 返回」按钮回到个人主页。
