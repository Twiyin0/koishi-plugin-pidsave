import { Context, Schema,h,Random, Logger } from 'koishi'
import { pixivHandler } from './handler'
import { resolve } from 'path'

export const name = 'pidsave'

export const usage = `
## 说明
本插件需要自建的pixivAPI服务，pixivAPI仓库地址[twiyin0/pixivAPI](#)  
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
  botName: string,
}

export const Config: Schema<Config> = Schema.object({
  apiUrl: Schema.string().required().role('link')
  .description("自建的pixivAPI地址"),
  savePath: Schema.string().default('.')
  .description("文件存储位置"),
  imgReserveUrl: Schema.string().default('https://i.pixiv.re').role('link')
  .description("pixiv图片加速地址"),
  botName: Schema.string().default('贝拉bot')
  .description('bot名称(用于展示合并转发消息)')
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
          
          // 调用修改后的 saveId 方法
          const result = await pidsave.saveId(ids, false);
          
          // 解析返回结果
          let existingIds: string[] = [];
          let r18Ids: string[] = [];
          let successIds: string[] = [];
          
          // 从返回消息中提取信息
          if (typeof result === 'string') {
              // 提取已存在的ID
              const existingMatch = result.match(/以下作品库存里已经有啦:\s*([\d, ]+)/);
              if (existingMatch) {
                  existingIds = existingMatch[1].split(',').map(id => id.trim());
              }
              
              // 提取R18作品的ID
              const r18Match = result.match(/以下作品被识别为R18内容:\s*([\d, ]+)/);
              if (r18Match) {
                  r18Ids = r18Match[1].split(',').map(id => id.trim());
              }
              
              // 计算成功保存的ID（不在已存在和R18列表中的）
              successIds = ids.filter(id => 
                  !existingIds.includes(id) && !r18Ids.includes(id)
              );
          }
          
          // 构建详细的结果消息
          let resultMessage = '';
          
          if (existingIds.length > 0) {
              resultMessage += `⚠️ 以下作品已存在: ${existingIds.join(', ')}\n\n`;
          }
          
          if (r18Ids.length > 0) {
              resultMessage += `🚫 以下作品包含R18内容: ${r18Ids.join(', ')}\n\n`;
          }
          
          if (successIds.length > 0) {
              resultMessage += `✅ 成功保存新作品: ${successIds.join(', ')}\n\n`;
              
              // 尝试获取第一个成功保存的作品预览
              try {
                  const firstSuccessId = successIds[0];
                  const resp: any = await pidsave.getRes(firstSuccessId);
                  
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
          resultMessage += `   ✅ 新增: ${successIds.length} 个\n`;
          resultMessage += `   ⚠️ 已存在: ${existingIds.length} 个\n`;
          resultMessage += `   🚫 R18内容: ${r18Ids.length} 个\n`;
          
          // 如果有多个成功作品，列出所有ID
          if (successIds.length > 1) {
              resultMessage += `\n🎨 新增作品ID: ${successIds.join(', ')}`;
          }
          
          // 如果没有成功保存任何作品
          if (successIds.length === 0 && existingIds.length === 0 && r18Ids.length === 0) {
              resultMessage = '❌ 没有成功保存任何作品，请检查ID是否正确或联系管理员';
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
          } else if (err.message?.includes('ENOENT') || err.message?.includes('文件')) {
              errorMessage = '❌ 保存失败！存储文件不存在或权限不足';
          } else {
              errorMessage = '❌ 保存失败！图片无法解析或处理过程中出现错误';
          }
          
          return errorMessage;
      }
  })

  ctx.command('pidanalysis <id:text>', 'pixiv pid解析(仅支持单个id)').alias('pida').alias('pid解析')
  .option('nosave', '-n 存图关闭')
  .option('origin', '-o 输出原图')
  .action(async ({session, options}, id) => {
    if (!id) return <>用法：pid 82693507 仅支持单个id</>
    let ids = id.replaceAll(/ /gi, '').replaceAll('，', ',');
    try {
      const imgUrl:any = await pidsave.getRes(ids);
      if (imgUrl) if(imgUrl.error) return <>{imgUrl.error}</>
      let orgUrl = imgUrl.illust.meta_pages;
      await session.send(<>解析pid##{id}##成功&#10;
      Title: {imgUrl.illust.title}&#10;
      画师: {imgUrl.illust.user.name}({imgUrl.illust.user.id})
      <image url={(orgUrl[0]? (options.origin? ((Random.pick(orgUrl) as any).image_urls.original):(Random.pick(orgUrl) as any).image_urls.medium) : options.origin? imgUrl.illust.meta_single_page.original_image_url : imgUrl.illust.image_urls.medium).replace('i.pximg.net', cfg.imgReserveUrl.startsWith('http')? cfg.imgReserveUrl.replace(/http(s)?:\/\//gi,''):cfg.imgReserveUrl)} />
      原图Url: {(orgUrl[0]? (Random.pick(orgUrl) as any).image_urls.original :imgUrl.illust.meta_single_page.original_image_url).replace('i.pximg.net', cfg.imgReserveUrl.startsWith('http')? cfg.imgReserveUrl.replace(/http(s)?:\/\//gi,''):cfg.imgReserveUrl)}&#10;
      10s内输入save或保存可以存图,使用pida -n &lt;id&gt;取消存图
      </>);
      if (options.nosave) return <>放弃保存,还想存再图库里可以使用存图命令</>
      let saveFlag = await session.prompt(10000);
      if (saveFlag && saveFlag.match(/(save|保存)/gi)) {
        try {
          let rep:any = await pidsave.saveId(ids);
          return <>存图成功！&#10;{rep}</>
        } catch (err) {
          return <>存图失败了</>
        }
      }
    } catch (err) {
      console.error('[pixividsave debug]>> ',err);
      console.log(err)
      return <>无法解析pid</>
    }
  })

  ctx.command('pidrandom <mode:number>', '库存内的图片随机取一张,0为竖屏1为横屏').alias('随机取图')
  .option('origin', '-o 输出原图')
  .action(async ({session,options}, mode) => {
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
      <image url={(orgUrl[0]? (options.origin? ((Random.pick(orgUrl) as any).image_urls.original):(Random.pick(orgUrl) as any).image_urls.medium) : options.origin? imgUrl.illust.meta_single_page.original_image_url : imgUrl.illust.image_urls.medium).replace('i.pximg.net', cfg.imgReserveUrl.startsWith('http')? cfg.imgReserveUrl.replace(/http(s)?:\/\//gi,''):cfg.imgReserveUrl)} />
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
        <author id={session.selfId} name={cfg.botName} avatar={`https://q1.qlogo.cn/g?b=qq&nk=${session.selfId}&s=640`}/>
          {message}
      </message>
    </message>
  } catch (err) { 
    ctx.logger.error(err);
    return <>哦吼！被你搜坏掉了</>
  }
  })

ctx.command("原站推荐", "获取pixiv推荐作品").alias("p站推荐").alias("pidr")
    .option("rank", "-r <type:string> 排名类型: day-每日, week-每周, month-每月, male-男性向, female-女性向")
    .option("count", "-c <num:number> 显示作品数量")
    .option("unsafe", "-u 显示R18内容", { authority: 2 })
    .action(async ({session, options}) => {
      try {
        // 只有当提供了rank参数时才设置rankType，否则为undefined
        let rankType: string | undefined;
        if (options.rank) {
          switch(options.rank) {
            case 'day': rankType = 'day'; break;
            case 'week': rankType = 'week'; break;
            case 'month': rankType = 'month'; break;
            case 'male': rankType = 'day_male'; break;
            case 'female': rankType = 'day_female'; break;
            default: rankType = options.rank;
          }
        }

        // 根据unsafe选项决定是否过滤R18（默认过滤，-u时不过滤）
        const excludeR18 = !options.unsafe;
        
        // 获取推荐数据
        const recommandData:any = rankType 
          ? await pidsave.getIllustRecommandSafe(rankType, excludeR18)
          : await pidsave.getIllustRecommandSafe(undefined, excludeR18);

        if (typeof recommandData === 'string') {
          return <>获取推荐失败: {recommandData}</>
        }

        const illusts = recommandData.illusts || [];
        if (illusts.length <= 0) {
          return <>暂时没有推荐作品</>
        }

        // 确定要显示的作品数量
        const displayCount = options.count ? Math.min(options.count, illusts.length) : 5;
        const displayIllusts = illusts.slice(0, displayCount);
        
        // 创建消息数组
        const messages = [];
        
        // 添加第一条消息作为概览
        messages.push(
          <message>
            ## 📈 {rankType ? getRankTypeName(rankType) + '推荐' : '综合推荐'}&#10;
            **🎯 模式:** {excludeR18 ? '🔒 安全模式' : '🔞 全量模式'}&#10;
            **📊 本次显示:** {displayIllusts.length} 个作品&#10;
            {recommandData.total_original && recommandData.total_filtered && excludeR18 ? 
              `**🔒 已过滤:** ${recommandData.total_original - recommandData.total_filtered} 个R18作品\n💡 提示: 使用 -u 参数查看所有内容\n` : ''}
            ---&#10;
          </message>
        );
        
        // 为每个作品创建一条消息
        for (let i = 0; i < displayIllusts.length; i++) {
          const illust = displayIllusts[i];
          const imageUrl = illust.image_urls?.medium || illust.image_urls?.square_medium;
          const safeImageUrl = imageUrl ? imageUrl.replace('i.pximg.net', cfg.imgReserveUrl.startsWith('http')? cfg.imgReserveUrl.replace(/http(s)?:\/\//gi,''):cfg.imgReserveUrl) : '';
          
          // 获取标签（最多5个）
          const tags = illust.tags?.slice(0, 5).map(tag => tag.translated_name || tag.name).join(', ') || '无';
          
          messages.push(
            <message>
              ### 🎨 作品 #{i + 1}&#10;
              **🆔 PID:** {illust.id}&#10;
              **📖 标题:** {illust.title}&#10;
              **👤 作者:** {illust.user?.name || '未知'} (ID: {illust.user?.id})&#10;
              **🏷️ 标签:** {tags}&#10;
              **⭐ 收藏:** {illust.total_bookmarks || 0}&#10;
              **👁️ 浏览:** {illust.total_view || 0}&#10;
              **📅 日期:** {new Date(illust.create_date).toLocaleDateString()}&#10;
              {safeImageUrl ? <img src={safeImageUrl}/> : ''}&#10;
              ---&#10;
            </message>
          );
        }
        
        // 添加尾部信息（剩余作品ID）
        const remainingCount = Math.min(10, illusts.length - displayCount);
        if (remainingCount > 0) {
          const remainingIllusts = illusts.slice(displayCount, displayCount + remainingCount);
          messages.push(
            <message>
              ### 📋 更多作品ID&#10;
              {remainingIllusts.map(illust => illust.id).join(', ')}&#10;
              **📊 总计推荐:** {recommandData.total_filtered || illusts.length} 个作品&#10;
              **💡 提示:** 使用 `-c 数字` 参数指定显示更多作品&#10;
            </message>
          );
        } else {
          messages.push(
            <message>
              **📊 总计推荐:** {recommandData.total_filtered || illusts.length} 个作品&#10;
              **💡 提示:** 使用 `-c 数字` 参数指定显示更多作品&#10;
            </message>
          );
        }

        // 使用合并消息返回所有消息
        return <message forward>
          <message>
            <author id={session.selfId} name={cfg.botName} avatar={`https://q1.qlogo.cn/g?b=qq&nk=${session.selfId}&s=640`}/>
            {messages}
          </message>
        </message>

      } catch (err) { 
        ctx.logger.error('推荐命令错误:', err);
        return <>推荐功能暂时不可用，请稍后重试</>
      }
  })
}

// 辅助函数：获取排名类型的中文名称
function getRankTypeName(rankType: string): string {
  const rankNames: {[key: string]: string} = {
    'day': '每日',
    'week': '每周', 
    'month': '每月',
    'day_male': '男性向',
    'day_female': '女性向',
    'week_original': '原创',
    'week_rookie': '新人'
  };
  return rankNames[rankType] || rankType;
}