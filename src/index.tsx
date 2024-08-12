import { Context, Schema,h,Random } from 'koishi'
import { pixivHandler } from './handler'
import { resolve } from 'path'

export const name = 'pidsave'

export const usage = `
## 说明
本插件基于[HibiAPI](https://github.com/mixmoe/HibiAPI)开发，可以查看原站自行部署HibiAPI  
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
  .description("自建的HibiAPI地址"),
  savePath: Schema.string().default('.')
  .description("文件存储位置"),
  imgReserveUrl: Schema.string().default('https://i.pixiv.re')
  .description("pixiv图片加速地址"),
})

export function apply(ctx: Context, cfg: Config) {
  // write your plugin here
  const pidsave = new pixivHandler(ctx, cfg.apiUrl, resolve(__dirname, cfg.savePath));

  ctx.command('pid <id:text>', '把pixiv作品id存在一个文件里').alias('存图')
  .action(async ({session}, id) => {
    console.log(resolve(__dirname, cfg.savePath));
    if (!id) return <>用法：pidsave 82693507，82351988&#10;用都改好隔开保存多个作品</>
    let ids = id.replaceAll(/ /gi, '').replaceAll('，', ',');
    try {
      const data = await pidsave.saveId(ids) // ctx.http.get(`${apiUrl}/add?id=${ids}`);
      const resp:any = await pidsave.getRes(ids) // ctx.http.get(`${apiUrl}/respond?id=${ids}`);
      // console.log(resp)
      let orgUrl = resp.illust.meta_pages;
      return <>
      {data}&#10;
      图片
      <image url={(orgUrl[0]? (Random.pick(orgUrl) as any).image_urls.medium : resp.illust.image_urls.medium).replace('i.pximg.net', cfg.imgReserveUrl)} />
      为首的作品数据保存完成！
      </>
    } catch (err) {
      console.error('[pixividsave debug]>> ');
      // console.log(err)
      return <>保存失败！图片无法解析</>
    }
  })

  ctx.command('pidanalysis <id:text>', 'pixiv pid解析(仅支持单个id)').alias('/解析').alias('pida').alias('pid解析')
  .action(async ({session}, id) => {
    if (!id) return <>用法：pid 82693507 仅支持单个id</>
    let ids = id.replaceAll(/ /gi, '').replaceAll('，', ',');
    try {
      const imgUrl:any = await pidsave.getRes(ids); // ctx.http.get(`${apiUrl}/respond?id=${ids}`);
      // console.log(imgUrl)
      if (imgUrl) if(imgUrl.error) return <>{imgUrl.error}</>
      // console.log(imgUrl);
      let orgUrl = imgUrl.illust.meta_pages;
      session.send(<>解析pid##{id}##成功&#10;
      Title: {imgUrl.illust.title}&#10;
      画师: {imgUrl.illust.user.name}({imgUrl.illust.user.id})
      <image url={(orgUrl[0]? (Random.pick(orgUrl) as any).image_urls.medium : imgUrl.illust.image_urls.medium).replace('i.pximg.net', cfg.imgReserveUrl)} />
      原图Url: {(orgUrl[0]? (Random.pick(orgUrl) as any).image_urls.original :imgUrl.illust.meta_single_page.original_image_url).replace('i.pximg.net', cfg.imgReserveUrl)}&#10;
      10s内输入save或保存可以存图
      </>);
      let saveFlag = await session.prompt(10000);
      let data;
      if (saveFlag && saveFlag.match(/(save|保存)/gi)) {
        try {
          let rep:any = await pidsave.saveId(ids); // ctx.http.get(`${apiUrl}/add?id=${ids}`);
          return <>存图成功！&#10;{rep}</>
        } catch (err) {
          return <>存图失败了</>
        }

      } else {
        return <>放弃保存,还想存再图库里可以使用存图命令</>
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
      const imgJson = await pidsave.getData(mode, false); // ctx.http.get(`${apiUrl}/data?mode=${mode}`);
      const imgUrl:any = Random.pick(imgJson);

      let orgUrl = imgUrl.illust.meta_pages;
      return <>随机取得一张图图&#10;
      Title: {imgUrl.illust.title}&#10;
      PID: {imgUrl.illust.id}&#10;
      画师: {imgUrl.illust.user.name}({imgUrl.illust.user.id})
      <image url={(orgUrl[0]? (Random.pick(orgUrl) as any).image_urls.medium : imgUrl.illust.image_urls.medium).replace('i.pximg.net', cfg.imgReserveUrl)} />
      原图Url: {(orgUrl[0]? (Random.pick(orgUrl) as any).image_urls.original :imgUrl.illust.meta_single_page.original_image_url).replace('i.pximg.net', cfg.imgReserveUrl)}
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
      const queryData = await pidsave.getQuery(keyword); // ctx.http.get(queryUrl+checkID);
      const rtData:any = (/^(|\s)+\d+(|\s)+$/).test(keyword)? queryData : Random.pick(queryData);
      let orgUrl = rtData.illust.meta_pages;
      return <>
      根据{(/^(|\s)+\d+(|\s)+$/).test(keyword)? 'id':'tag'}##{keyword}##随机获取了一张图图&#10;
      Title: {rtData.illust.title}&#10;
      PID: {rtData.illust.id}&#10;
      画师: {rtData.illust.user.name}({rtData.illust.user.id})&#10;
      <image url={(orgUrl[0]? (Random.pick(orgUrl) as any).image_urls.medium : rtData.illust.image_urls.medium).replace('i.pximg.net', cfg.imgReserveUrl)} />
      原图Url: {(orgUrl[0]? (Random.pick(orgUrl) as any).image_urls.original :rtData.illust.meta_single_page.original_image_url).replace('i.pximg.net', cfg.imgReserveUrl)}
      </>
    } catch (err) {
      return <>妹游找到相符的图图……</>
    }
  })

  ctx.command('pidstore', "查看图库库存情况").alias("库存查询")
  .action(async ({session}) => {
    try {
      const data = await pidsave.getData(0, true); // ctx.http.get(`${apiUrl}/data?count=true`);
      return data;
    } catch (err) {
      console.error(err);
      return <>md，又出问题！跟你爆了!!</>
    }
  })

  // 搜图功能，目前用的自己的api，而且效果不咋样，所以暂时不开放
  // ctx.command("sauce <img>", "在Saucenao搜图").alias("以图搜图")
  // .option('debug', '-d debug模式', {authority: 3})
  // .option('url', '-u 显示图片url')
  // .action(async ({session, options}, img) => {
  //   let imgUrl;
  //   let quoteImg;
  //   let getContentImgUrl;
  //   if (!img) {
  //     await session.send("30s内输入图片");
  //     let img = await session.prompt(30000);
  //     if (!img || !img.replace(' ', '').startsWith('<img')) return <>获取不到正确的图片url</>
  //     imgUrl = !imgUrl? h.select(img, 'img')[0].attrs.src:'';
  //   } else {
  //     quoteImg = session.quote? h.select(session.quote.content, 'img')[0].attrs.src:'';
  //     getContentImgUrl = delectImgElement(session.elements) == -1? '':session.elements[delectImgElement(session.elements)].attrs.src;
  //   }
  //   imgUrl = quoteImg? quoteImg : !imgUrl? getContentImgUrl:imgUrl;
  //   try {
  //     imgUrl = encodeURIComponent(imgUrl.replaceAll("&amp;","&"));
  //     console.log(`imgUrl: ${imgUrl}`);
  //     // if (options.url) await session.send(`图片url: ${imgUrl}`);
  //     if (imgUrl) {
  //       let results = await ctx.http.get(`http://localhost:3010/search?url=${imgUrl}`);
  //       // console.log(`imgUrl: ${imgUrl}\n`+results.results);
  //       if(options.debug) console.log(results[0]);
  //       if(results.includes('error')) return <>搜图服务器发生未知错误，请使用其他方式重试!</>
  //       if (results.error) return <>妹游搜到符合条件的图图</>
  //       // console.log(results);
  //       const filteredResults = results? results.filter(result => parseFloat(result.header.similarity) > (options.debug? 1:80)):[];
  //       if(!filteredResults.length) return <>妹游找到高度相似的图图</>
  //       // console.log(filteredResults);
  //       return <>SauceNao搜索结果&#10;
  //       {await selectForward(filteredResults)}
  //       </>
  //     }
  //   } catch (err) {
  //     console.error(`PixivIDSaved Debugger:`+err);
  //     return <>呜哇……被……被搜爆了……</>
  //   }
  // })

  ctx.command("原站搜索", "pixiv原站搜索").alias("搜图").alias("pids")
  .option("page", "-p <page:number> 分页")
  .option("forward", "-f 合并转发")
  .action(async ({session, options}, keyword) => {
    if (!keyword) return <>请输入关键词</>
    const apiUrl1 = await pidsave.search(keyword); // `${apiUrl}/search?keyword=${keyword}`;
    try {
      const data = await ctx.http.get(apiUrl1);
      let page = options.page? options.page:0;
      return options.forward? <message forward>
      <message>
      <author id={session.selfId} name="贝拉bot" avatar={`https://q1.qlogo.cn/g?b=qq&nk=${session.selfId}&s=640`}/>
      {parseIllusts(data.slice(page*10, ((page+1)*10)), 10, cfg)}
      </message>
    </message>
    :<>搜索结果(最多显示4条){parseIllusts(data.slice(page*4, (page*4)+3), 6, cfg)}</>
    } catch (err) {
      console.error("[pixivIDsave Debugger]"+err);
      return <>呜哇！不可以再搜啦！</>
    }
  })
}

// 搜图用的函数
// function delectImgElement(array) {
//   return array.findIndex(ele => ele.type == 'img');
// }

// function selectForward(array) {
//   const regex = /https?:\/\/[^\s]+?(?=https?:\/\/|$)/;
//   if (!array) return <>妹游找到高度相似的图图</>    //<image url={res.header.thumbnail} />&#10;
//   return array.map((res, index) => {
//     if (index < 3) {
//       const sourceUrl = res.data.ext_urls && res.data.ext_urls.length > 0
//         ? (res.data.ext_urls[0] || (res.data.ext_urls[0] === '' ? "无法获取" : res.data.ext_urls.match(regex)?.[0] ?? "无法获取"))
//         : "无法获取";
  
//       return (
//         <>
//           {index>0? <>&#10;&nbsp;&nbsp;</>:''}
//           {index + 1}&nbsp;&nbsp;精度: {res.header.similarity}
//           &#10;
//           标题: {res.data.title}
//           &#10;
//           <img src={res.header.thumbnail.replace("https://img3.saucenao.com", "https://sau.in0.re").replace("https://img1.saucenao.com", "https://sau.in0.re").replaceAll("&amp;", "&")} alt="thumbnail" />
//           &#10;
//           作者: {res.data.member_name}
//           &#10;
//           源地址: {sourceUrl}
//           &#10;
//           {res.data.pixiv_id? <>&#10;pixivID: {res.data.pixiv_id}&#10;</>:'' }
//         </>
//       );
//     }
//     return null;
//   });  
// }

function parseIllusts(array, count, cfg:Config) {
  if (!array) return <>妹游在原站找到对应的图图</>;

  return array.map((res, index) => {
    if (index < count) {
      return (
        <div>
          {index>=0? <>&#10;&nbsp;&nbsp;</>:''}
          {index + 1}&nbsp;&nbsp;ID: {res.id}
          &#10;
          <img 
            src={res.meta_pages[0] ? res.meta_pages[0].image_urls.medium.replace("https://i.pximg.net", cfg.imgReserveUrl) 
                                   : res.image_urls.medium.replace("https://i.pximg.net", cfg.imgReserveUrl)} 
            alt="thumbnail" 
          />
          &#10;
          标题: {res.title}
          &#10;
          作者: {res.user.name} ({res.user.id})
          &#10;
          Tags: {res.tags.map(tag => tag.translated_name ? tag.translated_name : tag.name).join(', ')}
          &#10;
          作品地址: {"https://www.pixiv.net/artworks/" + res.id}
        </div>
      );
    }
    return null;
  });
}
