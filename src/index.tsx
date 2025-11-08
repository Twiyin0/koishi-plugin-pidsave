import { Context, Schema,h,Random, Logger } from 'koishi'
import { pixivHandler } from './handler'
import { resolve } from 'path'

export const name = 'pidsave'

export const usage = `
## 说明
本插件需要自建的pixivAPI服务，pixivAPI仓库地址[twiyin0/pixivAPI](#算了，不打算开源)  
只做了简单的测试，可能会有问题，可以在github上提issue  
***插件处于试验阶段*** 

* 命令
  - pid 13441117, 120970130, https://www.pixiv.net/artworks/120966133
  - pida https://www.pixiv.net/artworks/120966133 或者 pida 120970130
  - pids 萝莉
  - pidrandom 0 (0从横屏、竖屏，其他中随机获取一张图图， 1横屏，2竖屏)
  - pidget 13441117 或 pidget 碧蓝档案
  - pidstore （获取库存数量）
`

export interface Config {
  apiUrl: string,
  savePath: string,
  imgReserveUrl: string,
}

export const Config: Schema<Config> = Schema.object({
  apiUrl: Schema.string().required().role('link')
  .description("自建的pixivAPI地址"),
  savePath: Schema.string().default('.')
  .description("文件存储位置"),
  imgReserveUrl: Schema.string().default('https://i.pixiv.re')
  .description("pixiv图片加速地址"),
})

export function apply(ctx: Context, cfg: Config) {
  const pidsave = new pixivHandler(ctx, cfg.apiUrl, resolve(__dirname, cfg.savePath));

  ctx.command('pid <id:text>', '把pixiv作品id存在一个文件里').alias('存图')
  .action(async ({session}, id) => {                               
      console.log(resolve(__dirname, cfg.savePath));
      if (!id) return <>用法：pidsave 82693507，82351988&#10;用逗号隔开保存多个作品</>

      let ids = id.replaceAll(/ /gi, '')
                  .replaceAll('，', ',')
                  .replaceAll('https://www.pixiv.net/artworks/', '')
                  .split(',')
                  .filter(item => item && item.trim() !== '');
      
      if (ids.length === 0) {
          return <>没有提供有效的PID</>
      }
      
      try {

          session.send(`开始处理 ${ids.length} 个作品，请稍候...`);
          
          const data = await pidsave.saveId(ids);
          const existingIds = typeof data === 'string' && data.includes('已经有啦') 
              ? data.match(/\d+/g) || []
              : [];
          
          const newIds = ids.filter(id => !existingIds.includes(id));
          
          // 构建详细的结果消息
          let resultMessage = '';
          
          if (existingIds.length > 0) {
              resultMessage += `⚠️ 以下作品已存在: ${existingIds.join(', ')}\n\n`;
          }
          
          if (newIds.length > 0) {
              resultMessage += `✅ 成功保存新作品: ${newIds.join(', ')}\n\n`;
              
              try {
                  const firstNewId = newIds[0];
                  const resp: any = await pidsave.getRes(firstNewId);
                  
                  if (resp && !resp.error) {
                      let previewUrl = '';
                      if (resp.illust.meta_pages && resp.illust.meta_pages.length > 0) {
                          previewUrl = resp.illust.meta_pages[0].image_urls.medium;
                      } else {
                          previewUrl = resp.illust.image_urls.medium;
                      }
                      
                      // 替换图片域名
                      previewUrl = previewUrl.replace('i.pximg.net', 
                          cfg.imgReserveUrl.startsWith('http') 
                              ? cfg.imgReserveUrl.replace(/http(s)?:\/\//gi, '')
                              : cfg.imgReserveUrl
                      );
                      
                      // 发送图片预览
                      session.send(<>
                          本组首个作品预览：
                          <image url={previewUrl} />
                      </>);
                      
                      // 添加作品详细信息
                      resultMessage += `📝 首个作品详情:\n`;
                      resultMessage += `  标题: ${resp.illust.title}\n`;
                      resultMessage += `  作者: ${resp.illust.user.name}\n`;
                      resultMessage += `  标签: ${resp.illust.tags.map(tag => tag.translated_name || tag.name).slice(0, 5).join(', ')}${resp.illust.tags.length > 5 ? '...' : ''}\n`;
                      resultMessage += `  尺寸: ${resp.illust.width} × ${resp.illust.height}\n`;
                      resultMessage += `  页数: ${resp.illust.page_count}\n`;
                      
                  }
              } catch (previewError) {
                  console.error('获取作品预览失败:', previewError);
                  resultMessage += `❌ 无法获取作品预览信息\n`;
              }
          }
          
          // 添加统计信息
          resultMessage += `\n📊 统计:\n`;
          resultMessage += `   总计处理: ${ids.length} 个作品\n`;
          resultMessage += `   ✅ 新增: ${newIds.length} 个\n`;
          resultMessage += `   ⚠️ 已存在: ${existingIds.length} 个\n`;
          
          // 如果有多个新作品，列出所有新作品ID
          if (newIds.length > 1) {
              resultMessage += `\n🎨 新增作品ID: ${newIds.join(', ')}`;
          }
          
          return resultMessage;
          
      } catch (err) {
          console.error('[pixividsave debug]>> ', err);
          
          // 更详细的错误信息
          let errorMessage = '保存失败！';
          if (err.message?.includes('R18')) {
              errorMessage = '❌ 保存失败！作品可能包含R18内容';
          } else if (err.message?.includes('network') || err.message?.includes('timeout')) {
              errorMessage = '❌ 保存失败！网络连接超时，请稍后重试';
          } else {
              errorMessage = '❌ 保存失败！图片无法解析或处理过程中出现错误';
          }
          
          return errorMessage;
      }
  })

  ctx.command('pidanalysis <id:text>', 'pixiv pid解析(仅支持单个id)').alias('pida').alias('pid解析')
  .option('save', '-s 存图开启')
  .action(async ({session, options}, id) => {
    if (!id) return <>用法：pid 82693507 仅支持单个id</>
    let ids = id.replaceAll(/ /gi, '').replaceAll('，', ',');
    try {
      const imgUrl:any = await pidsave.getRes(ids);
      if (imgUrl) if(imgUrl.error) return <>{imgUrl.error}</>
      let orgUrl = imgUrl.illust.meta_pages;
      session.send(<>解析pid##{id}##成功&#10;
      Title: {imgUrl.illust.title}&#10;
      画师: {imgUrl.illust.user.name}({imgUrl.illust.user.id})
      <image url={(orgUrl[0]? (Random.pick(orgUrl) as any).image_urls.medium : imgUrl.illust.image_urls.medium).replace('i.pximg.net', cfg.imgReserveUrl.startsWith('http')? cfg.imgReserveUrl.replace(/http(s)?:\/\//gi,''):cfg.imgReserveUrl)} />
      原图Url: {(orgUrl[0]? (Random.pick(orgUrl) as any).image_urls.original :imgUrl.illust.meta_single_page.original_image_url).replace('i.pximg.net', cfg.imgReserveUrl.startsWith('http')? cfg.imgReserveUrl.replace(/http(s)?:\/\//gi,''):cfg.imgReserveUrl)}&#10;
      使用pida -s &lt;id&gt;且10s内输入save或保存可以存图
      </>);
      if (options.save) {
        let saveFlag = await session.prompt(10000);
        if (saveFlag && saveFlag.match(/(save|保存)/gi)) {
          try {
            let rep:any = await pidsave.saveId(ids);
            return <>存图成功！&#10;{rep}</>
          } catch (err) {
            return <>存图失败了</>
          }

        } else {
          return <>放弃保存,还想存再图库里可以使用存图命令</>
        }
      }
    } catch (err) {
      console.error('[pixividsave debug]>> ');
      console.log(err)
      return <>无法解析pid</>
    }
  })

  ctx.command('pidrandom <mode:number>', '库存内的图片随机取一张,0为竖屏1为横屏').alias('随机取图')
  .action(async ({session}, mode) => {
    if (mode<0 || mode>2) return <>用法：pidrandom 0&#10;0为所有随机1为横屏2为竖屏</>
    if (!mode) mode = 0;
    try {
      const imgJson = await pidsave.getData(mode, false);
      const imgUrl:any = Random.pick(imgJson);

      let orgUrl = imgUrl.illust.meta_pages;
      return <>随机取得一张图图&#10;
      Title: {imgUrl.illust.title}&#10;
      PID: {imgUrl.illust.id}&#10;
      画师: {imgUrl.illust.user.name}({imgUrl.illust.user.id})
      <image url={(orgUrl[0]? (Random.pick(orgUrl) as any).image_urls.medium : imgUrl.illust.image_urls.medium).replace('i.pximg.net', cfg.imgReserveUrl.startsWith('http')? cfg.imgReserveUrl.replace(/http(s)?:\/\//gi,''):cfg.imgReserveUrl)} />
      原图Url: {(orgUrl[0]? (Random.pick(orgUrl) as any).image_urls.original :imgUrl.illust.meta_single_page.original_image_url).replace('i.pximg.net', cfg.imgReserveUrl.startsWith('http')? cfg.imgReserveUrl.replace(/http(s)?:\/\//gi,''):cfg.imgReserveUrl)}
      </>
    } catch (err) {
      console.error(err)
      return <>md，又出问题！跟你你爆了!!</>
    }
  })

  ctx.command('pidget <keyword>', '根据id或tag找图（仅限一个id和tag）').alias('取图')
  .action(async ({session}, keyword) => {
    if (!keyword) return <>请输入关键词</>
    try {
      const queryData = await pidsave.getQuery(keyword);
      const rtData:any = (/^(|\s)+\d+(|\s)+$/).test(keyword)? queryData : Random.pick(queryData);
      let orgUrl = rtData.illust.meta_pages;
      return <>
      根据{(/^(|\s)+\d+(|\s)+$/).test(keyword)? 'id':'tag'}##{keyword}##随机获取了一张图图&#10;
      Title: {rtData.illust.title}&#10;
      PID: {rtData.illust.id}&#10;
      画师: {rtData.illust.user.name}({rtData.illust.user.id})&#10;
      <image url={(orgUrl[0]? (Random.pick(orgUrl) as any).image_urls.medium : rtData.illust.image_urls.medium).replace('i.pximg.net', cfg.imgReserveUrl.startsWith('http')? cfg.imgReserveUrl.replace(/http(s)?:\/\//gi,''):cfg.imgReserveUrl)} />
      原图Url: {(orgUrl[0]? (Random.pick(orgUrl) as any).image_urls.original :rtData.illust.meta_single_page.original_image_url).replace('i.pximg.net', cfg.imgReserveUrl.startsWith('http')? cfg.imgReserveUrl.replace(/http(s)?:\/\//gi,''):cfg.imgReserveUrl)}
      </>
    } catch (err) {
      return <>妹游找到相符的图图……</>
    }
  })

  ctx.command('pidstore', "查看图库库存情况").alias("库存查询")
  .action(async ({session}) => {
    try {
      const data = await pidsave.getData(0, true);
      return data;
    } catch (err) {
      console.error(err);
      return <>md，又出问题！跟你爆了!!</>
    }
  })

  ctx.command('piddelete <id:text>', "查看图库库存情况").alias("图片删除")
  .action(async ({session}, id) => {
    if (!id) return <>不告诉我id我怎么删嘛！</>
    try {
      const data = await pidsave.deleteId(id);
      return data;
    } catch (err) {
      console.error(err);
      return <>md，又出问题！跟你爆了!!</>
    }
  })

  ctx.command("原站搜索", "pixiv原站搜索").alias("搜图").alias("pids")
  .option("result", "-r <num:number> 显示其他结果个数")
  .option('first', '-f <num:number> 预览展示图片标号')
  .action(async ({session, options}, keyword) => {
    if (!keyword) return <>请输入关键词</>
    try {
    const sData:any = await pidsave.search(keyword, options.result? options.result:11, options.first? options.first:1);

    if (sData.illustLength <= 0) {
        return <>你搜的啥啊</>
    }

    // if(options.select) {

    // }
    // 格式化返回消息
    let message = <message>
      ## 🔍 搜索 "{keyword}" 结果&#10;
      ### 🎨 首个作品&#10;
      **🆔 ID:** {sData.firstResult.id}&#10;
      **📖 标题:** {sData.firstResult.title}&#10;
      **👤 作者:** {sData.firstResult.userName}&#10;
      **🏷️ 标签:** {sData.firstResult.tags.join(', ')}&#10;
      **🖼️ 预览:** <img src={sData.firstResult.url.replace('i.pximg.net', cfg.imgReserveUrl.startsWith('http')? cfg.imgReserveUrl.replace(/http(s)?:\/\//gi,''):cfg.imgReserveUrl)}/>&#10;
      ### 📋 其他作品ID (前{sData.otherResults.length}个)&#10;
      {sData.otherResults.join(', ')}&#10;
      **📊 总计找到:** {sData.illustLength} 个作品&#10;
    </message>

    // 统计信息
    return <message forward>
      <message>
        <author id={session.selfId} name="贝拉bot" avatar={`https://q1.qlogo.cn/g?b=qq&nk=${session.selfId}&s=640`}/>
          {message}
      </message>
    </message>
  } catch (err) { 
    ctx.logger.error(err);
    return <>哦吼！被你搜坏掉了</>
  }
  })
}
