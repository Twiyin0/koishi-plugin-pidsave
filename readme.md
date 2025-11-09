# koishi-plugin-pidsave

[![npm](https://img.shields.io/npm/v/koishi-plugin-pidsave?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-pidsave)

A plugin for save pixiv illusts detail and other apllication.

## 说明
**注意** 在`v1.0.0`后改插件采用自建API，但是暂时还没有开源，等敏感信息屏蔽后会开源在github，如果你想提前体验可以QQ或邮箱联系作者  
本插件(v1.0.0前)基于[HibiAPI](https://github.com/mixmoe/HibiAPI)开发，可以查看原站自行部署HibiAPI  
只做了简单的测试，可能会有问题，可以在github上提issue  
***插件仍处于试验阶段***  

* 命令
  - pid 13441117, 120970130, https://www.pixiv.net/artworks/120966133
  - pida https://www.pixiv.net/artworks/120966133 或者 pida 120970130
  - pids 萝莉
  - pidrandom 0 (0从横屏、竖屏，其他中随机获取一张图图， 1横屏，2竖屏)
  - pidget 13441117 或 pidget 碧蓝档案
  - pidstore （获取库存数量）
  - piddelete 13441117 , 删除id对应的作品数据
  - pidr -r day , pixiv推荐，-r可选为每日排行

# CHANGELOG
## 1.0.0-beta.2
### 修复
* 修复了pid存图会存R18作品的问题，同时加上提示R18存储情况

## 1.0.0-beta.1
### 新增
* 新增了piddelete、pidr（推荐功能）
### 修复
* 修复了一堆bug，重建api（改为自建API）

## 0.0.3
### 修复
* 修复了图片链接错误的问题

## 0.0.2
### 修复
* 修复了一些bug

## 0.0.1

- Initial release


