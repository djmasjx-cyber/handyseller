import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { KnowledgeService } from './knowledge.service';

interface ParseTarget {
  url: string;
  category: string;
}

const SITE_BASE = 'https://app.handyseller.ru';

const PARSE_TARGETS: ParseTarget[] = [
  { url: `${SITE_BASE}/faq`, category: 'faq' },
  { url: `${SITE_BASE}/kak-prodavat-hendmeid-na-marketpleysah`, category: 'guide' },
  { url: `${SITE_BASE}/kak-prodavat-hendmeid-na-wildberries`, category: 'guide' },
  { url: `${SITE_BASE}/kak-prodavat-hendmeid-na-ozon`, category: 'guide' },
  { url: `${SITE_BASE}/kak-prodavat-hendmeid-na-yandex-markete`, category: 'guide' },
  { url: `${SITE_BASE}/blog`, category: 'blog' },
  { url: `${SITE_BASE}/blog/kak-upakovyvat-hendmeid-dlya-marketpleysov`, category: 'blog' },
  { url: `${SITE_BASE}/blog/kak-stat-samozanyatym-i-nachat-prodavat`, category: 'blog' },
  { url: `${SITE_BASE}/blog/kak-sdelat-foto-hendmeida-dlya-marketpleysov`, category: 'blog' },
  { url: `${SITE_BASE}/blog/kak-rasschitat-tsenu-hendmeida`, category: 'blog' },
  { url: `${SITE_BASE}/blog/chto-mozhno-sdelat-svoimi-rukami-dlya-prodazhi`, category: 'blog' },
  { url: `${SITE_BASE}`, category: 'landing' },
];

@Injectable()
export class ContentParserService implements OnModuleInit {
  private readonly logger = new Logger(ContentParserService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly knowledgeService: KnowledgeService,
  ) {}

  async onModuleInit(): Promise<void> {
    setTimeout(() => this.parseAll(), 10_000);
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async parseAll(): Promise<void> {
    this.logger.log('Starting content parse...');
    let success = 0;
    for (const target of PARSE_TARGETS) {
      try {
        await this.parsePage(target);
        success++;
      } catch (err) {
        this.logger.warn(`Failed to parse ${target.url}: ${(err as Error).message}`);
      }
    }
    this.logger.log(`Content parse complete: ${success}/${PARSE_TARGETS.length} pages`);
  }

  private async parsePage(target: ParseTarget): Promise<void> {
    const { data: html } = await firstValueFrom(
      this.httpService.get<string>(target.url, {
        headers: { 'User-Agent': 'HandySeller-ContentParser/1.0' },
        timeout: 15000,
      }),
    );

    const textContent = this.extractText(html);
    if (textContent.length < 50) {
      this.logger.debug(`Skipping ${target.url}: too short (${textContent.length} chars)`);
      return;
    }

    const title = this.extractTitle(html) || target.url;

    await this.knowledgeService.upsertArticle({
      sourceUrl: target.url,
      title,
      content: textContent,
      category: target.category,
    });
  }

  private extractTitle(html: string): string | null {
    const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return m ? m[1].replace(/\s*\|\s*HandySeller.*$/, '').trim() : null;
  }

  private extractText(html: string): string {
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    if (text.length > 8000) {
      text = text.slice(0, 8000);
    }

    return text;
  }
}
