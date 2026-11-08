# Emby / Jellyfin for MyGo Music

在 [MyGo Music](https://github.com/egoist/mygo-music) 里听你自己 [Emby](https://emby.media) 或 [Jellyfin](https://jellyfin.org) 服务器上的音乐：ALAC、FLAC 原样无损播放，收藏、播放列表、播放次数和服务器同步，.lrc 歌词按时间显示。

Jellyfin 由 Emby 分支而来，两者的接口基本相同，同一个插件两边都能用。测试过 Emby 4.10 和 Jellyfin 12.4。

[English](README.en.md)

## 安装

在 MyGo Music 的「设置 → 插件 → `+`」里粘贴 `https://github.com/LYJW131/mygo-music-emby-jellyfin`，或[点这里安装](mygo-music://install-plugin?repo=LYJW131/mygo-music-emby-jellyfin)。

<a id="setting-up"></a>

## 设置

在「设置 → 插件 → Emby / Jellyfin」里填写：

| 设置          | 填什么                                                                              |
| ------------- | ----------------------------------------------------------------------------------- |
| 服务器地址    | 如 `http://192.168.1.2:8096`；只填 IP 或主机名时默认端口 8096                       |
| API 密钥      | 二选一：Emby 控制台「高级 → API 密钥」里创建的密钥                                  |
| 用户名 / 密码 | 二选一：你的 Emby 账户。用 API 密钥时可只填用户名，指定用谁的媒体库（默认用管理员） |

然后在来源里选 **Emby / Jellyfin**，点登录。

## 功能

- 首页：今日推荐（每天从媒体库随机挑选）、最近播放、最近添加、最常播放、播放列表、随便听听、艺术家。
- 专辑、艺术家、流派页，全部专辑分页浏览，搜索歌曲 / 专辑 / 艺术家 / 播放列表，搜索建议。
- 收藏歌曲（即服务器上的「收藏」），播放时计入服务器的播放次数和最近播放。
- 播放列表：新建、重命名、删除、添加、移除、排序，都直接改服务器上的播放列表。
- 随机电台：全部随机、收藏随机、从未播放、重温。
- 歌词：服务器读到的 .lrc 文件或标签里带时间的歌词，同一时间的两行显示为原文和翻译；Jellyfin 提供逐字时间时按字显示。没有时间轴的歌词不显示。
- 音质：「无损」播放原文件（ALAC、FLAC、MP3、AAC、Vorbis、WAV），App 播不了的格式（如 Opus、APE、WMA）由服务器转成 FLAC 或 MP3；「高」和「标准」由服务器转成 320 / 128 kbps MP3，本身就够小的有损文件原样播放。

## 隐私

- API 密钥、用户名和密码保存在插件设置里，用密码登录得到的访问令牌保存在插件数据里，都**未加密**，只发给你填的服务器。
- 插件在服务器的「设备」里显示为 MyGo Music。

## Jellyfin 的小差异

- 用 API 密钥时，Jellyfin 不让「没有登录用户」的请求移动歌单里的歌，插件会改为把挪动位置之后的歌先删掉、再按新顺序加回去，结果一样。
- 普通用户（非管理员）也能重命名自己的歌单。

## 许可

[AGPL-3.0](LICENSE)。与 Emby、Jellyfin 无关联。
