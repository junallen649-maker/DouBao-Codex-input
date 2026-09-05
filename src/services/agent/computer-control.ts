import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';

export interface OperationPlan {
  isOperational: boolean;
  type?: 'word_document' | 'file_creation' | 'command_execution';
  targetPath?: string;
  suggestedFilename?: string;
  enhancedPrompt: string;
}

export class ComputerControlEngine {
  /**
   * Resolve user's actual Desktop directory reliably on Windows
   */
  public static getDesktopDir(): string {
    const home = os.homedir();
    const standard = path.join(home, 'Desktop');
    if (fs.existsSync(standard)) return standard;
    const oneDrive = path.join(home, 'OneDrive', 'Desktop');
    if (fs.existsSync(oneDrive)) return oneDrive;
    return standard;
  }

  /**
   * Analyze user prompt to check if it contains computer control intent
   */
  public static analyzeIntent(userPrompt: string): OperationPlan {
    const p = userPrompt.trim();

    const isWord = /(word|docx|\.doc|文档)/i.test(p) && /(创建|新建|写|生成|保存)/.test(p);
    const isDesktop = /(桌面|desktop)/i.test(p);
    const isFileCreate = /(创建|新建|生成).*(文件|脚本|\.txt|\.py|\.js|\.html|\.json|\.md)/i.test(p);
    const isCommandExec = /(执行|运行|打开|查询|查看|获取).*(命令|程序|计算器|记事本|ip|端口|进程)/i.test(p);

    if (isWord) {
      let suggestedName = '';
      const nameMatch = p.match(/(?:名为|叫|文件名为|保存为|生成)\s*([a-zA-Z0-9_一-龥-]+\.(?:docx|doc))/i) ||
                        p.match(/(?:名为|叫)\s*([a-zA-Z0-9_一-龥-]+)/i) ||
                        p.match(/《([^》]+)》/);
      if (nameMatch) {
        let n = nameMatch[1];
        if (!n.endsWith('.docx') && !n.endsWith('.doc')) n += '.docx';
        suggestedName = n;
      } else if (/鲁迅.*秋/i.test(p) || /秋.*鲁迅/i.test(p)) {
        suggestedName = '秋夜_鲁迅风格散文.docx';
      } else if (/鲁迅/i.test(p)) {
        suggestedName = '鲁迅风格小说.docx';
      } else if (/散文|小说/i.test(p)) {
        suggestedName = '散文小说.docx';
      } else {
        suggestedName = '新建文档.docx';
      }

      const desktopDir = this.getDesktopDir();
      const targetPath = path.join(desktopDir, suggestedName);

      // Extract the pure creative request by removing desktop/word operational boilerplate
      let coreRequest = p
        .replace(/^(?:请|帮我|在我的?桌面|桌面|本地)?(?:创建一个?新的?|新建一个?|生成一个?|做一个?|写一个?|保存一个?)(?:word|docx|\.doc|文档)[，, ]*(?:里面写|内容是|写|内容为)?/i, '')
        .trim();
      if (!coreRequest) coreRequest = p;

      const enhancedPrompt = `请直接在当前对话框中完整输出全文内容（不要使用文档卡片或独立文档模式）：${coreRequest}。直接给出精选标题和完整正文段落，开头严禁任何寒暄客套，结尾严禁任何多余说明。`;

      return {
        isOperational: true,
        type: 'word_document',
        targetPath,
        suggestedFilename: suggestedName,
        enhancedPrompt
      };
    }

    if (isFileCreate) {
      const matchExt = p.match(/\.([a-zA-Z0-9]+)/);
      const ext = matchExt ? matchExt[1] : 'txt';
      const filenameMatch = p.match(/(?:名为|叫|文件)\s*([a-zA-Z0-9_一-龥-]+\.[a-zA-Z0-9]+)/);
      const filename = filenameMatch ? filenameMatch[1] : `新文件.${ext}`;
      const desktopDir = this.getDesktopDir();
      const targetPath = isDesktop ? path.join(desktopDir, filename) : path.resolve(process.cwd(), filename);

      let coreRequest = p
        .replace(/^(?:请|帮我|在我的?桌面|桌面|本地)?(?:创建一个?新的?|新建一个?|生成一个?|做一个?|写一个?|保存一个?)(?:文件|脚本)?[，, ]*/i, '')
        .trim();
      if (!coreRequest) coreRequest = p;

      const enhancedPrompt = `请直接在对话中输出完整代码（不要使用独立文档卡片）：${coreRequest}。
要求：
1. 请提供完整、无省略、开箱即用的代码；
2. 务必使用代码块（\`\`\`${ext} ... \`\`\`）包裹完整代码；
3. 直接给出实现，开头结尾不要有多余寒暄客套。`;

      return {
        isOperational: true,
        type: 'file_creation',
        targetPath,
        suggestedFilename: filename,
        enhancedPrompt
      };
    }

    if (isCommandExec) {
      const enhancedPrompt = `用户需要执行本地命令：${p}
请直接给出最直接、可靠的 PowerShell 代码块（\`\`\`powershell ... \`\`\`）来完成该操作，并简述说明。`;

      return {
        isOperational: true,
        type: 'command_execution',
        enhancedPrompt
      };
    }

    return {
      isOperational: false,
      enhancedPrompt: userPrompt
    };
  }

  /**
   * Create a styled Word document on the local file system
   */
  public static async createWordDocument(
    targetPath: string,
    content: string
  ): Promise<{ success: boolean; filePath: string; error?: string }> {
    try {
      const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
      let title = '';
      const paragraphs: string[] = [];

      const isIntroOrOutro = (l: string) => {
        return /^(好的|这是|以下是|为您创作|希望您喜欢|如有需要|如果您需要|注：|说明：|要不要)/.test(l) ||
               l.includes('工作任务模式') ||
               l.includes('文风模仿') ||
               l.includes('字数约') ||
               l.includes('AI 助手') ||
               l.includes('豆包') ||
               l.includes('复制粘贴') ||
               l.includes('要不要开启');
      };

      for (const rawLine of lines) {
        const line = rawLine.replace(/[\r]/g, '').trim();
        if (!line || line.startsWith('```')) continue;
        if (isIntroOrOutro(line)) continue;

        // Check if line looks like a title
        if (line.startsWith('#') || line.startsWith('《') || line.includes('标题：') || /^\*\*.*\*\*$/.test(line)) {
          const cleanTitle = line.replace(/^[#\s《》*标题：:]+/, '').replace(/[》*\s]+$/, '').trim();
          if (cleanTitle && !title && cleanTitle.length < 30) {
            title = cleanTitle;
            continue;
          }
        }

        const cleanPara = line.replace(/\*\*/g, '').replace(/__/g, '').trim();
        if (cleanPara) {
          paragraphs.push(cleanPara);
        }
      }

      // If title wasn't found in header format, see if the first paragraph is short enough to be a title
      if (!title && paragraphs.length > 0) {
        const first = paragraphs[0];
        if (first.length <= 20 && !/[。！？!?,，]/.test(first.slice(-1))) {
          title = paragraphs.shift()!;
        }
      }

      if (!title) {
        title = path.basename(targetPath, path.extname(targetPath)).replace(/[_-]/g, ' ');
      }

      // Ensure directory exists
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const docParagraphs = [
        new Paragraph({
          text: title,
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 360, before: 180 }
        })
      ];

      for (const para of paragraphs) {
        docParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: '　　' + para, // Chinese 2-space paragraph indentation
                size: 24, // 12pt
                font: 'Microsoft YaHei'
              })
            ],
            spacing: { line: 360, before: 120, after: 120 }
          })
        );
      }

      const doc = new Document({
        sections: [
          {
            properties: {},
            children: docParagraphs
          }
        ]
      });

      const buffer = await Packer.toBuffer(doc);
      fs.writeFileSync(targetPath, buffer);
      console.log('[ComputerControl] Word document created successfully at:', targetPath);

      return {
        success: true,
        filePath: targetPath
      };
    } catch (err: any) {
      console.error('[ComputerControl] Failed to create Word document:', err);
      return {
        success: false,
        filePath: targetPath,
        error: err.message
      };
    }
  }

  /**
   * Create a generic text/code file on the local file system
   */
  public static async createGenericFile(
    targetPath: string,
    rawContent: string
  ): Promise<{ success: boolean; filePath: string; error?: string }> {
    try {
      let fileContent = rawContent;
      const codeMatch = rawContent.match(/```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/);
      if (codeMatch) {
        fileContent = codeMatch[1].trim();
      }

      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(targetPath, fileContent, 'utf-8');
      console.log('[ComputerControl] File created successfully at:', targetPath);

      return {
        success: true,
        filePath: targetPath
      };
    } catch (err: any) {
      console.error('[ComputerControl] Failed to create file:', err);
      return {
        success: false,
        filePath: targetPath,
        error: err.message
      };
    }
  }

  /**
   * Execute a command via PowerShell
   */
  public static executePowerShell(cmd: string): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      exec(`powershell -ExecutionPolicy Bypass -Command "${cmd.replace(/"/g, '\\"')}"`, (err, stdout, stderr) => {
        resolve({
          stdout: stdout || '',
          stderr: (stderr || (err ? err.message : '')).trim()
        });
      });
    });
  }
}
