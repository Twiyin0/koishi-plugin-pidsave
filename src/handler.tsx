import { Context } from 'koishi'
import path  from 'path'
import fs from 'fs'

export class pixivHandler {
    private ctx: Context;
    private apiUrl: string;
    private saveFilePath: string;
    constructor(ctx: Context, apiUrl: string, saveFilePath: string) {
        this.ctx = ctx;
        this.apiUrl = apiUrl;
        this.saveFilePath = saveFilePath;
    }

    // 修改 saveId 方法以支持数组输入
    public async saveId(id: string | string[], r18?: boolean | undefined) {
      let ids: string[];
      
      // 处理字符串和数组两种输入
      if (Array.isArray(id)) {
          ids = id;
      } else {
          if (!id) {
              return '必须要id参数!';
          }
          const cleanedUrls = id.split(',');
          const noEmptyUrls = cleanedUrls.filter(item => item != null && item != undefined && item != "");
          ids = noEmptyUrls.map(url => url.replace('https://www.pixiv.net/artworks/', ''));
      }

      try {
          const result = await this.processIds(ids, r18 ? false : true);
          const existingIds = result.existingIds;
          const r18Ids = result.r18Ids;
          
          let message = '';
          
          if (existingIds.length > 0) {
              message += `以下作品库存里已经有啦: ${existingIds.join(', ')}\n`;
          }
          
          if (r18Ids.length > 0) {
              message += `以下作品被识别为R18内容: ${r18Ids.join(', ')}\n`;
          }
          
          if (existingIds.length === 0 && r18Ids.length === 0) {
              message += '全部保存好啦！';
          } else if (existingIds.length > 0 && r18Ids.length === 0) {
              message = message.trim(); // 移除末尾换行
          }
          
          return message || '处理完成';
      } catch (error) {
          this.ctx.logger.error('无法处理ID', error);
          return '保存失败，请检查日志';
      }
    }

    public async deleteId(id: string) {
        if (!id) {
            return '必须要id参数!';
        }

        const cleanedUrls = id.split(',');
        const noEmptyUrls = cleanedUrls.filter(item => item != null && item != undefined && item != "");
        const ids = noEmptyUrls.map(url => url.replace('https://www.pixiv.net/artworks/', ''));

        try {
            const result = await this.deleteIdsFromFiles(ids);
            return result;
        } catch (error) {
            this.ctx.logger.error('删除ID时出错', error);
            return '删除失败，请检查日志';
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
    public async search(keyword: string, otherCount?: number, firstSelect?: number, R18?: boolean) {
        if (!keyword) return '缺少参数keyword';
        try {
            const searchData = await this.ctx.http.get(`${this.apiUrl}/search?word=${keyword}${R18? 'r18=true':''}`);
            
            // 根据新的响应结构获取数据
            const illustrations = searchData.body?.illustManga?.data || [];
            
            if (illustrations.length === 0) {
                return '没有找到相关作品';
            }

            let illustLength = illustrations.length;

            // 获取第一个结果
            const firstResult = illustrations[firstSelect? firstSelect-1:0];
            
            // 构建第一个结果的详细信息
            const firstResultInfo = {
                id: firstResult.id,
                title: firstResult.title,
                author: firstResult.userName,
                tags: firstResult.tags,
                imageUrl: firstResult.url
            };

            // 获取除第一个结果外的前10个结果的ID
            const otherResults = illustrations.slice(1, otherCount? otherCount:11).map(item => item.id);
            firstSelect-1<=0 && firstSelect<=illustLength-1? otherResults[firstSelect]=otherResults[otherCount+1]:'';

            return { firstResult, firstResultInfo, otherResults, illustLength, searchData }

        } catch (error) {
            this.ctx.logger.error('搜索数据时出错:', error);
            return '搜索失败，请稍后重试';
        }
    }

    private async fetchPixivIllust(id: string | number, excludeR18?: boolean) {
        const url = this.apiUrl + `/data?id=${id}&single=true`;
        
        try {
            const response = await this.ctx.http.get(url);
            const data = response;
            
            // 检查图片是否受限
            if (data.illust.image_urls.medium.includes('s.pximg.net') && 
                data.illust.image_urls.medium.includes('limit_sanity')) {
                return null;
            }
            
            // 检查R18标签
            const r18Illustrations = await this.getR18Illustrations(data);
            if (r18Illustrations.length > 0) {
                if (excludeR18) {
                    return null; // R18作品，排除
                } else {
                    return data; // R18作品，但不排除
                }
            } else {
                return data; // 非R18作品
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
      
    private async processIds(ids: any, excludeR18: boolean) {
      const filePaths = {
          acc: path.join(this.saveFilePath + '/result_acc.json'),
          ver: path.join(this.saveFilePath + '/result_ver.json'),
          other: path.join(this.saveFilePath + '/result_other.json')
      };
      const existingIds = [];
      const idsToFetch = [];
      const r18Ids = []; // 新增：存储R18作品的ID

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
                  idsToFetch.map(id => this.fetchPixivIllust(id, excludeR18 ? true : false))
              );

              // 过滤掉fetchPixivIllust返回的空项，并记录R18作品
              const validData = [];
              for (let i = 0; i < data.length; i++) {
                  const item = data[i];
                  const id = idsToFetch[i];
                  
                  if (item === null || item === undefined) {
                      // 如果返回空，说明是R18作品或被限制的作品
                      if (excludeR18) {
                          r18Ids.push(id);
                      }
                  } else {
                      validData.push({ ...item, id: id });
                  }
              }

              const accData = [];
              const verData = [];
              const otherData = [];

              for (const item of validData) {
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

          return { existingIds, r18Ids }; // 修改返回值结构

      } catch (error) {
          this.ctx.logger.error('无法处理分析函数', error);
          throw error;
      }
    }
    private async getR18Illustrations(data: any) {
        const r18Pattern = /(r|R)-?18/;
        
        const containsR18Tag = illustration =>
            illustration.illust.tags.some(tag =>
                r18Pattern.test(tag.name) || (tag.translated_name && r18Pattern.test(tag.translated_name))
            );
        
        if (!data) return [];
        if (Array.isArray(data)) {
            return data.filter(item => containsR18Tag(item));
        } else if (typeof data === 'object' && data !== null) {
            return containsR18Tag(data) ? [data] : [];
        } else {
            throw new TypeError('Expected data to be an array or an object');
        }
    }
    
    private async deleteIdsFromFiles(ids: string[]): Promise<string> {
      const filePaths = {
          acc: path.join(this.saveFilePath + '/result_acc.json'),
          ver: path.join(this.saveFilePath + '/result_ver.json'),
          other: path.join(this.saveFilePath + '/result_other.json')
      };

      const deletedResults = {
          acc: [] as string[],
          ver: [] as string[],
          other: [] as string[]
      };

      const notFoundIds = [...ids];

      try {
          // 处理横屏文件
          if (fs.existsSync(filePaths.acc)) {
              const fileContent = await fs.readFileSync(filePaths.acc, 'utf8');
              let data = JSON.parse(fileContent);
              const originalLength = data.length;
              
              data = data.filter(item => {
                  const shouldKeep = !ids.includes(item.id);
                  if (!shouldKeep) {
                      deletedResults.acc.push(item.id);
                      const index = notFoundIds.indexOf(item.id);
                      if (index > -1) {
                          notFoundIds.splice(index, 1);
                      }
                  }
                  return shouldKeep;
              });

              if (data.length !== originalLength) {
                  await fs.writeFileSync(filePaths.acc, JSON.stringify(data, null, 2), 'utf8');
                  this.ctx.logger.info(`从横屏文件中删除了 ${originalLength - data.length} 个项目`);
              }
          }

          // 处理竖屏文件
          if (fs.existsSync(filePaths.ver)) {
              const fileContent = await fs.readFileSync(filePaths.ver, 'utf8');
              let data = JSON.parse(fileContent);
              const originalLength = data.length;
              
              data = data.filter(item => {
                  const shouldKeep = !ids.includes(item.id);
                  if (!shouldKeep) {
                      deletedResults.ver.push(item.id);
                      const index = notFoundIds.indexOf(item.id);
                      if (index > -1) {
                          notFoundIds.splice(index, 1);
                      }
                  }
                  return shouldKeep;
              });

              if (data.length !== originalLength) {
                  await fs.writeFileSync(filePaths.ver, JSON.stringify(data, null, 2), 'utf8');
                  this.ctx.logger.info(`从竖屏文件中删除了 ${originalLength - data.length} 个项目`);
              }
          }

          // 处理其他文件
          if (fs.existsSync(filePaths.other)) {
              const fileContent = await fs.readFileSync(filePaths.other, 'utf8');
              let data = JSON.parse(fileContent);
              const originalLength = data.length;
              
              data = data.filter(item => {
                  const shouldKeep = !ids.includes(item.id);
                  if (!shouldKeep) {
                      deletedResults.other.push(item.id);
                      const index = notFoundIds.indexOf(item.id);
                      if (index > -1) {
                          notFoundIds.splice(index, 1);
                      }
                  }
                  return shouldKeep;
              });

              if (data.length !== originalLength) {
                  await fs.writeFileSync(filePaths.other, JSON.stringify(data, null, 2), 'utf8');
                  this.ctx.logger.info(`从其他文件中删除了 ${originalLength - data.length} 个项目`);
              }
          }

          // 构建返回消息
          const messages = [];
          
          if (deletedResults.acc.length > 0) {
              messages.push(`横屏: ${deletedResults.acc.join(', ')}`);
          }
          if (deletedResults.ver.length > 0) {
              messages.push(`竖屏: ${deletedResults.ver.join(', ')}`);
          }
          if (deletedResults.other.length > 0) {
              messages.push(`其他: ${deletedResults.other.join(', ')}`);
          }
          if (notFoundIds.length > 0) {
              messages.push(`未找到: ${notFoundIds.join(', ')}`);
          }

          if (messages.length === 0) {
              return '没有找到要删除的ID';
          }

          return `删除完成:\n${messages.join('\n')}`;

      } catch (error) {
          this.ctx.logger.error('删除ID时出错:', error);
          throw error;
      }
    }

    /**
     * 获取推荐插画
     * @param rank 排名类型，可选值: 'day' | 'week' | 'month' | 'day_male' | 'day_female' | 'week_original' | 'week_rookie' | 'day_r18' | 'day_male_r18' | 'day_female_r18' | 'week_r18' | 'week_r18g'
     * @returns 推荐插画数据
     */
    public async getIllustRecommand(rank?: string) {
      try {
        // 构建请求URL
        let url = `${this.apiUrl}/recommand`;
        if (rank) {
            url += `?rank=${rank}`;
        }

        // 发送请求
        const response = await this.ctx.http.get(url);
        
        // 根据你提供的返回格式，响应中应该包含 illusts 数组
        if (!response || !response.illusts) {
            return '没有获取到推荐数据';
        }

        // 返回完整的推荐数据
        return response;
      } catch (error) {
        this.ctx.logger.error('获取推荐插画时出错:', error);
        
        // 根据错误类型返回不同的错误信息
        if (error.response?.status === 404) {
            return '推荐API端点不存在，请检查API配置';
        } else if (error.response?.status === 401) {
            return 'API认证失败，请检查API密钥';
        } else {
            return '获取推荐失败，请稍后重试';
        }
      }
    }

    /**
     * 获取推荐插画的简化信息（可选）
     * @param rank 排名类型
     * @param count 返回数量，默认10个
     * @returns 简化后的推荐信息
     */
    public async getIllustRecommandSimple(rank?: string, count: number = 10) {
      try {
          const response = await this.getIllustRecommand(rank);
          
          if (typeof response === 'string') {
              return response; // 返回错误信息
          }

          const illusts = response.illusts || [];
          const limitedIllusts = illusts.slice(0, count);

          // 构建简化响应
          const simplifiedResponse = {
              total: illusts.length,
              returned: limitedIllusts.length,
              illusts: limitedIllusts.map(illust => ({
                  id: illust.id,
                  title: illust.title,
                  author: illust.user.name,
                  tags: illust.tags.map(tag => tag.translated_name || tag.name),
                  image_url: illust.image_urls.medium,
                  total_bookmarks: illust.total_bookmarks,
                  total_view: illust.total_view,
                  create_date: illust.create_date
              }))
          };

          return simplifiedResponse;

      } catch (error) {
          this.ctx.logger.error('获取简化推荐时出错:', error);
          return '获取推荐失败';
      }
    }

    /**
     * 获取推荐并过滤R18内容
     * @param rank 排名类型
     * @param excludeR18 是否排除R18内容，默认true
     * @returns 过滤后的推荐数据
     */
    public async getIllustRecommandSafe(rank?: string, excludeR18: boolean = true) {
      try {
          const response = await this.getIllustRecommand(rank);
          
          if (typeof response === 'string') {
              return response;
          }

          let illusts = response.illusts || [];

          // 过滤R18内容
          if (excludeR18) {
              illusts = illusts.filter(illust => {
                  // 根据x_restrict字段判断是否为R18
                  // x_restrict: 0-普通, 1-R18, 2-R18G
                  return illust.x_restrict === 0;
              });
          }

          return {
              ...response,
              illusts: illusts,
              total_original: response.illusts.length,
              total_filtered: illusts.length
          };

      } catch (error) {
          this.ctx.logger.error('获取安全推荐时出错:', error);
          return '获取推荐失败';
      }
    }
}
