import { Context } from 'koishi'
import path  from 'path'
import fs from 'fs'

export class pixivHandler {
    private ctx: Context;
    // https://api.example.com
    private apiUrl: string;
    private saveFilePath: string;
    constructor(ctx: Context, apiUrl: string, saveFilePath: string) {
        this.ctx = ctx;
        this.apiUrl = apiUrl;
        this.saveFilePath = saveFilePath;
    }

    // 原api的 /add
    public async saveId(id:string, r18?:boolean|undefined) {
        if (!id) {
          return '必须要id参数!';
        }
        const cleanedUrls = id.split(',');
        const noEmptyUrls = cleanedUrls.filter(item => item != null && item != undefined && item != "");
        const ids = noEmptyUrls.map(url => url.replace('https://www.pixiv.net/artworks/', ''));
      
        try {
          const existingIds = await this.processIds(ids, r18? true:false);
          if (existingIds.length > 0) {
            return `以下作品库存里已经有啦: ${existingIds.join(', ')}`;
          } else {
            return '全部保存好啦！';
          }
        } catch (error) {
          this.ctx.logger.error('无法处理ID', error);
          return '保存失败，请检查日志';
        }
    }

    // 原api的 /data
    public async getData(mode:any, count:boolean) {
        const accFilePath = path.join(this.saveFilePath+'/result_acc.json');
        const verFilePath = path.join(this.saveFilePath+'/result_ver.json');
        const otherFilePath = path.join(this.saveFilePath+'/result_other.json');
      
        try {
          const accFileContent = await fs.readFileSync(accFilePath, 'utf8')
          const verFileContent = await fs.readFileSync(verFilePath, 'utf8')
          const otherFileContent = await fs.readFileSync(otherFilePath, 'utf8')
      
          const accData = JSON.parse(accFileContent);
          const verData = JSON.parse(verFileContent);
          const otherData = JSON.parse(otherFileContent);
      
          let resultData;
          if (mode === '1') {
            resultData = accData;
          } else if (mode === '2') {
            resultData = verData;
          } else if (mode === '3') {
            resultData = otherData;
          } else {
            resultData = [...accData, ...verData, ...otherData];
          }
      
          if (count) {
            return `总库存: ${accData.length + verData.length + otherData.length}, 横屏: ${accData.length}, 竖屏: ${verData.length}, 其他: ${otherData.length}`;
          } else {
            return resultData;
          }
        } catch (error) {
          if (error.code === 'ENOENT') {
            return "无法获取文件"
          } else {
            this.ctx.logger.error('读取文件时出错', error);
            return '读取文件时出错';
          }
        }
    }
    
    // 原api的 /respond
    public async getRes(id:string) {
        if (!id) {
          return 'Missing id parameter';
        }
        const cleanedUrls = id.split(',');
        const ids = cleanedUrls.map(url => url.replace('https://www.pixiv.net/artworks/', ''));
        
        try {
          const resJson = await this.fetchPixivIllust(ids[0]);
          let r18a = await this.getR18Illustrations(resJson);
          if (r18a.length>0) return { "error": "该作品含有R18内容" };
          else return resJson;
        } catch (error) {
          this.ctx.logger.error('Error reading data file:', error);
          return 'Internal Server Error';
        }
    }

    // 原api的 /query
    public async getQuery(keyword: string) {
        let id:string;
        let tag:string;
        (/^(|\s)+\d+(|\s)+$/).test(keyword)? id = `${keyword}` : tag = `${keyword}`;
        const filePaths = [
          path.join(this.saveFilePath+'/result_acc.json'),
          path.join(this.saveFilePath+'/result_ver.json'),
          path.join(this.saveFilePath+'/result_other.json')
        ];
      
        try {
          for (const filePath of filePaths) {
            const fileContent = await fs.readFileSync(filePath, 'utf8')
            const data = JSON.parse(fileContent);
      
            if (id) {
              const result = data.find(item => item.id === id);
              if (result) {
                return result;
              }
            }
      
            if (tag) {
              const results = data.filter(item => 
                item.illust && 
                item.illust.tags && 
                item.illust.tags.some(t => t.name === tag || t.translated_name === tag)
              );
              if (results.length > 0) {
                return results;
              }
            }
          }
      
          return "没有获取到匹配的项目";
        } catch (error) {
          this.ctx.logger.error('Error querying data:', error);
          return "发生未知错误";
        }
    }

    // 原api的 /search
    public async search(keyword:string, r18?:boolean) {
        if (!keyword) return '缺少参数keyword';
        try {
            const searchData = await this.ctx.http.get(this.apiUrl+`/api/pixiv/search?word=${keyword}`);
            const illustrations = searchData.illusts;
            const data = illustrations.filter(illustration =>
                !illustration.tags.some(tag => /R-?18/i.test(tag.name))
            );
            if (r18) return illustrations;
            else return data;
        } catch (error) {
            this.ctx.logger.error('Error searching data:', error);
        }
    }

    private async fetchPixivIllust(id: string|number, r18?: boolean) {
        const url = this.apiUrl+`/api/pixiv/illust?id=${id}`;
        
        try {
            const response = await this.ctx.http.get(url);
            const data = response;
            if (data.illust.image_urls.medium.includes('s.pximg.net')&&data.illust.image_urls.medium.includes('limit_sanity')) return ;
            if (r18) return data;
            if ((await this.getR18Illustrations(data)).length > 0) {
                return ;
            } else {
                return data;
            }
        } catch (error) {
            this.ctx.logger.error(`无法获取作品 ${id} 的详细信息:`, error);
            throw error;
        }
    }

    private async isIdExist(id:string|number, filePath:string) {
        try {
          const fileContent = await fs.readFileSync(filePath, 'utf8');
          const existingData = JSON.parse(fileContent);
          return existingData.some(item => item.id === id);
        } catch (error) {
          if (error.code === 'ENOENT') {
            return false;
          } else {
            this.ctx.logger.error(`无法读取文件:`, error);
            throw error;
          }
        }
      }
      
      private async appendDataToFile(data:any, filePath:string) {
        try {
          let existingData = [];
          try {
            const fileContent = await fs.readFileSync(filePath, 'utf8');
            existingData = JSON.parse(fileContent);
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
          }
      
          existingData.push(...data);
      
          await fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2), 'utf8');
          this.ctx.logger.info('数据已成功追加到文件！');
        } catch (error) {
          this.ctx.logger.error('追加数据到文件时出错:', error);
          throw error;
        }
      }
      
      private async processIds(ids:any, excludeR18:boolean) {
        const filePaths = {
          acc: path.join(this.saveFilePath+'/result_acc.json'),
          ver: path.join(this.saveFilePath+'/result_ver.json'),
          other: path.join(this.saveFilePath+'/result_other.json')
        };
        const existingIds = [];
        const idsToFetch = [];
      
        try {
          for (const id of ids) {
            const existsInAcc = await this.isIdExist(id, filePaths.acc);
            const existsInVer = await this.isIdExist(id, filePaths.ver);
            const existsInOther = await this.isIdExist(id, filePaths.other);
      
            if (existsInAcc || existsInVer || existsInOther) {
              existingIds.push(id);
            } else {
              idsToFetch.push(id);
            }
          }
      
          if (idsToFetch.length > 0) {
            const data = await Promise.all(
              idsToFetch.map(id => this.fetchPixivIllust(id, excludeR18? true: false))
            );
      
            // 过滤掉fetchPixivIllust返回的空项
            const validData = data.filter(item => item !== null && item !== undefined);
            const dataWithIds = validData.map((item, index) => ({ ...item, id: idsToFetch[index] }));
      
            const accData = [];
            const verData = [];
            const otherData = [];
      
            for (const item of dataWithIds) {
              if (item.illust) {
                const { width, height } = item.illust;
                if (!item.illust.tags) {
                  otherData.push(item); // 受限的图片
                } else {
                  if (width > height * 1.3) {
                    accData.push(item);
                  } else if (height > width * 1.3) {
                    verData.push(item);
                  } else {
                    otherData.push(item);
                  }
                }
              } else {
                otherData.push(item); // 处理缺少 illust 属性的数据
              }
            }
      
            await this.appendDataToFile(accData, filePaths.acc);
            await this.appendDataToFile(verData, filePaths.ver);
            await this.appendDataToFile(otherData, filePaths.other);
          }
      
          return existingIds;
        } catch (error) {
          this.ctx.logger.error('无法处理分析函数', error);
          throw error;
        }
      }

    private async getR18Illustrations(data:any) {
        const r18Pattern = /R(-)?18/gi;
        
        const containsR18Tag = illustration =>
            illustration.illust.tags.some(tag =>
            r18Pattern.test(tag.name) || (tag.translated_name && r18Pattern.test(tag.translated_name))
            );
        if (!data) return ["数组为空",1,2,3];
        if (Array.isArray(data)) {
            return data.filter(item => containsR18Tag(item));
        } else if (typeof data === 'object' && data !== null) {
            return containsR18Tag(data) ? [data] : [];
        } else {
            throw new TypeError('Expected data to be an array or an object');
        }
    }
}
